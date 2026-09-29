package expo.modules.frameextractor

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.CanvasOverlay
import androidx.media3.common.Effect
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

class VideoExportRequest : Record {
  @Field lateinit var exportId: String
  @Field lateinit var inputPath: String
  @Field lateinit var outputPath: String
  @Field var clipStartMs: Long = 0
  @Field var clipEndMs: Long = 0
  @Field var outputShortSide: Int = 0
  @Field var includeAudio: Boolean = false
  @Field var watermark: Boolean = true
  @Field var sourceWidth: Int = 0
  @Field var sourceHeight: Int = 0
  @Field var sourceRotationDegrees: Int = 0
  @Field var coordinateWidth: Int = 0
  @Field var coordinateHeight: Int = 0
  @Field var calAX: Double = 0.0
  @Field var calAY: Double = 0.0
  @Field var calBX: Double = 0.0
  @Field var calBY: Double = 0.0
  @Field var releaseX: Double = 0.0
  @Field var releaseY: Double = 0.0
  @Field var bounceX: Double = 0.0
  @Field var bounceY: Double = 0.0
  @Field var showReferences: Boolean = false
  @Field var referenceALabel: String = ""
  @Field var referenceBLabel: String = ""
  @Field var bounceUncertain: Boolean = false
  @Field var releaseAtMs: Double = 0.0
  @Field var bounceAtMs: Double = 0.0
  @Field var frameToleranceMs: Double = 0.0
  @Field var speedKmh: Double = 0.0
  @Field var errorKmh: Double = 0.0
  @Field var speedText: String = ""
  @Field var rangeText: String = ""
  @Field var methodText: String = ""
  @Field var pathText: String = ""
  @Field var stripText: String = ""
  @Field var colorBg: String = ""
  @Field var colorText: String = ""
  @Field var colorMuted: String = ""
  @Field var colorAccent: String = ""
}

private data class ActiveExport(
  val id: String,
  val transformer: Transformer,
  val output: File,
  val promise: Promise,
  val startedAtMs: Long,
  val overlay: PaceballOverlay,
  val settled: AtomicBoolean = AtomicBoolean(false),
)

/**
 * Media3 owns decoding, effects, MediaCodec and MP4 muxing. This class only
 * validates Paceball's private files, supplies the HUD and bridges lifecycle to
 * JavaScript. It deliberately permits one export at a time.
 */
@OptIn(UnstableApi::class)
class VideoExporter(
  private val context: Context,
  private val progress: (Map<String, Any?>) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private var active: ActiveExport? = null

  fun start(request: VideoExportRequest, promise: Promise) {
    main.post {
      var createdJob: ActiveExport? = null
      try {
        if (active != null) throw IllegalStateException("A Paceball video export is already running.")
        validate(request)
        val input = privateFile(request.inputPath, mustExist = true)
        val output = privateOutput(request.outputPath)
        output.parentFile?.mkdirs()
        if (output.exists()) output.delete()

        val rotation = videoRotation(input)
        if (rotation != request.sourceRotationDegrees) {
          throw IllegalArgumentException(
            "Source video rotation changed between planning and export."
          )
        }
        val overlay = PaceballOverlay(request, rotation)
        val mediaItem = MediaItem.Builder()
          .setUri(Uri.fromFile(input))
          .setClippingConfiguration(
            MediaItem.ClippingConfiguration.Builder()
              .setStartPositionMs(request.clipStartMs)
              .setEndPositionMs(request.clipEndMs)
              .build()
          )
          .build()
        // Scale first, so the HUD is drawn at the size it is shared at. Only ever
        // down: a short side of 0 keeps the source's own size.
        val videoEffects = mutableListOf<Effect>()
        if (request.outputShortSide > 0) videoEffects.add(Presentation.createForShortSide(request.outputShortSide))
        videoEffects.add(OverlayEffect(listOf(overlay)))
        val edited = EditedMediaItem.Builder(mediaItem)
          .setRemoveAudio(!request.includeAudio)
          .setEffects(Effects(emptyList(), videoEffects))
          .build()

        lateinit var transformer: Transformer
        transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: androidx.media3.transformer.Composition, result: ExportResult) {
              finishSuccess(request.exportId, rotation)
            }

            override fun onError(
              composition: androidx.media3.transformer.Composition,
              result: ExportResult,
              exception: ExportException,
            ) {
              finishError(request.exportId, "Video export failed: ${exception.message ?: "unknown Media3 error"}", exception)
            }
          })
          .build()

        createdJob = ActiveExport(
          id = request.exportId,
          transformer = transformer,
          output = output,
          promise = promise,
          startedAtMs = SystemClock.elapsedRealtime(),
          overlay = overlay,
        )
        active = createdJob
        transformer.start(edited, output.absolutePath)
        pollProgress(request.exportId)
      } catch (error: Throwable) {
        val job = createdJob
        if (job != null && active === job) {
          active = null
          job.transformer.cancel()
          if (job.output.exists()) job.output.delete()
        }
        promise.reject("E_VIDEO_EXPORT", error.message ?: "Could not start video export.", error)
      }
    }
  }

  fun cancel(exportId: String, promise: Promise) {
    main.post {
      val job = active
      if (job == null || job.id != exportId || !job.settled.compareAndSet(false, true)) {
        promise.resolve(false)
        return@post
      }
      active = null
      job.transformer.cancel()
      if (job.output.exists()) job.output.delete()
      job.promise.reject("E_VIDEO_EXPORT_CANCELLED", "Video export was cancelled.", null)
      promise.resolve(true)
    }
  }

  fun destroy() {
    main.post {
      val job = active ?: return@post
      if (!job.settled.compareAndSet(false, true)) return@post
      active = null
      job.transformer.cancel()
      if (job.output.exists()) job.output.delete()
      job.promise.reject("E_VIDEO_EXPORT_CANCELLED", "Video export stopped because Paceball closed.", null)
    }
  }

  private fun pollProgress(exportId: String) {
    main.postDelayed({
      val job = active
      if (job == null || job.id != exportId || job.settled.get()) return@postDelayed
      val holder = ProgressHolder()
      val state = job.transformer.getProgress(holder)
      if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
        progress(mapOf("exportId" to exportId, "progress" to holder.progress))
      }
      pollProgress(exportId)
    }, 200)
  }

  private fun finishSuccess(exportId: String, rotation: Int) {
    val job = active
    if (job == null || job.id != exportId || !job.settled.compareAndSet(false, true)) return
    active = null
    if (!job.output.exists() || job.output.length() <= 0) {
      job.promise.reject("E_VIDEO_EXPORT", "Media3 completed without writing a video.", null)
      return
    }
    progress(mapOf("exportId" to exportId, "progress" to 100))
    job.promise.resolve(mapOf(
      "outputPath" to "file://${job.output.absolutePath}",
      "outputBytes" to job.output.length().toDouble(),
      "elapsedMs" to (SystemClock.elapsedRealtime() - job.startedAtMs).toDouble(),
      "canvasWidth" to job.overlay.canvasWidth,
      "canvasHeight" to job.overlay.canvasHeight,
      "sourceRotationDegrees" to rotation,
      "coordinateMode" to job.overlay.coordinateMode,
    ))
  }

  private fun finishError(exportId: String, message: String, error: Throwable) {
    val job = active
    if (job == null || job.id != exportId || !job.settled.compareAndSet(false, true)) return
    active = null
    if (job.output.exists()) job.output.delete()
    job.promise.reject("E_VIDEO_EXPORT", message, error)
  }

  private fun validate(request: VideoExportRequest) {
    if (request.exportId.isBlank()) throw IllegalArgumentException("Video export needs an ID.")
    if (request.clipStartMs < 0 || request.clipEndMs <= request.clipStartMs) {
      throw IllegalArgumentException("Video export has invalid trim times.")
    }
    if (request.coordinateWidth <= 0 || request.coordinateHeight <= 0) {
      throw IllegalArgumentException("Video export has invalid coordinate dimensions.")
    }
    if (request.sourceWidth <= 0 || request.sourceHeight <= 0 ||
      request.sourceRotationDegrees !in listOf(0, 90, 180, 270)) {
      throw IllegalArgumentException("Video export has invalid source dimensions or rotation.")
    }
    if (!request.releaseAtMs.isFinite() || !request.bounceAtMs.isFinite() ||
      request.releaseAtMs < 0 || request.bounceAtMs <= request.releaseAtMs ||
      request.bounceAtMs > request.clipEndMs - request.clipStartMs) {
      throw IllegalArgumentException("Video export marks fall outside the trimmed clip.")
    }
    if (!request.frameToleranceMs.isFinite() || request.frameToleranceMs < 0) {
      throw IllegalArgumentException("Video export has an invalid frame tolerance.")
    }
    if (request.outputShortSide < 0 || request.outputShortSide % 2 != 0 ||
      (request.outputShortSide > 0 && request.outputShortSide >= min(request.sourceWidth, request.sourceHeight))) {
      throw IllegalArgumentException("Video export may only scale down, to an even size.")
    }
    if (!request.speedKmh.isFinite() || request.speedKmh <= 0 ||
      !request.errorKmh.isFinite() || request.errorKmh < 0 ||
      request.speedText.isBlank() || request.rangeText.isBlank() || request.methodText.isBlank()) {
      throw IllegalArgumentException("Video export needs a measured speed and error range.")
    }
    // Fail closed: a free export is never written without its watermark.
    if (request.watermark && request.stripText.isBlank()) {
      throw IllegalArgumentException("A free video export must carry the Paceball watermark.")
    }
    for (color in listOf(request.colorBg, request.colorText, request.colorMuted, request.colorAccent)) {
      if (!Regex("^#[0-9A-Fa-f]{6}$").matches(color)) {
        throw IllegalArgumentException("Video export has an invalid colour.")
      }
    }
  }

  private fun privateFile(uri: String, mustExist: Boolean): File {
    if (!uri.startsWith("file://")) throw IllegalArgumentException("Video export requires a private file URI.")
    val file = File(Uri.parse(uri).path ?: throw IllegalArgumentException("Video path is invalid.")).canonicalFile
    val roots = listOf(context.filesDir.canonicalFile, context.cacheDir.canonicalFile)
    if (roots.none { file.path == it.path || file.path.startsWith(it.path + File.separator) }) {
      throw IllegalArgumentException("Video export only accepts Paceball private files.")
    }
    if (mustExist && (!file.isFile || file.length() <= 0)) {
      throw IllegalArgumentException("The source video is missing or empty.")
    }
    return file
  }

  private fun privateOutput(uri: String): File {
    val file = privateFile(uri, mustExist = false)
    val exportRoot = File(context.cacheDir, "paceball-video-exports").canonicalFile
    if (!file.path.startsWith(exportRoot.path + File.separator) || file.extension.lowercase() != "mp4") {
      throw IllegalArgumentException("Video output must be an MP4 in Paceball's export cache.")
    }
    return file
  }

  private fun videoRotation(file: File): Int {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    } finally {
      retriever.release()
    }
  }
}

/**
 * The HUD. Every frame carries the whole reading on an opaque plate: the speed,
 * a free export's watermark strip, then the range and what the reading is. The
 * marks arrive with the frames they were placed on: references throughout,
 * release from the release frame, the bounce, the straight connector and
 * "Marked, not tracked" from the bounce frame. Nothing moves between marks,
 * nothing is interpolated and nothing counts up.
 */
@OptIn(UnstableApi::class)
private class PaceballOverlay(
  private val request: VideoExportRequest,
  private val sourceRotation: Int,
) : CanvasOverlay(true) {
  @Volatile var canvasWidth: Int = 0
    private set
  @Volatile var canvasHeight: Int = 0
    private set
  @Volatile var coordinateMode: String = "not-drawn"
    private set

  private val bg = Color.parseColor(request.colorBg)
  private val fg = Color.parseColor(request.colorText)
  private val muted = Color.parseColor(request.colorMuted)
  private val accent = Color.parseColor(request.colorAccent)

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val bold = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
  }
  private val regular = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
  }

  override fun onDraw(canvas: Canvas, presentationTimeUs: Long) {
    canvasWidth = canvas.width
    canvasHeight = canvas.height
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    validateCanvas(canvas)
    // Sizes are written for a 720 px short side and scale with the frame.
    val s = min(canvas.width, canvas.height) / 720f
    val timeMs = presentationTimeUs / 1_000.0
    val released = timeMs >= request.releaseAtMs - request.frameToleranceMs
    val bounced = timeMs >= request.bounceAtMs - request.frameToleranceMs

    val a = map(request.calAX, request.calAY, canvas)
    val b = map(request.calBX, request.calBY, canvas)
    val release = map(request.releaseX, request.releaseY, canvas)
    val bounce = map(request.bounceX, request.bounceY, canvas)

    // The plate sits on top unless a mark would be under it; then at the foot.
    val plateHeight = plateHeight(canvas, s)
    val marks = mutableListOf(release, bounce)
    if (request.showReferences) {
      marks.add(a)
      marks.add(b)
    }
    val reach = 56f * s
    val topClear = marks.all { it.second > plateHeight + reach }
    val bottomClear = marks.all { it.second < canvas.height - plateHeight - reach }
    val plateTop = if (topClear || !bottomClear) 0f else canvas.height - plateHeight

    if (request.showReferences) {
      for ((p, name) in listOf(a to request.referenceALabel, b to request.referenceBLabel)) {
        ring(canvas, p, s)
        stroke.color = fg
        stroke.strokeWidth = 3f * s
        val c = 10f * s
        canvas.drawLine(p.first - c, p.second, p.first + c, p.second, stroke)
        canvas.drawLine(p.first, p.second - c, p.first, p.second + c, stroke)
        if (name.isNotBlank()) label(canvas, name, p, s)
      }
    }
    if (bounced) {
      // Straight dots from one mark to the other: the two marks joined, not a flight.
      fill.color = accent
      val dx = bounce.first - release.first
      val dy = bounce.second - release.second
      val count = max(2, (hypot(dx, dy) / (22f * s)).toInt())
      for (i in 1 until count) {
        val t = i.toFloat() / count
        canvas.drawCircle(release.first + dx * t, release.second + dy * t, 3.5f * s, fill)
      }
    }
    if (released) {
      ring(canvas, release, s)
      fill.color = accent
      canvas.drawCircle(release.first, release.second, 7f * s, fill)
      label(canvas, "Release", release, s)
    }
    if (bounced) {
      ring(canvas, bounce, s)
      if (request.bounceUncertain) {
        stroke.color = accent
        stroke.strokeWidth = 3f * s
        val r = 9f * s
        val diamond = Path().apply {
          moveTo(bounce.first, bounce.second - r)
          lineTo(bounce.first + r, bounce.second)
          lineTo(bounce.first, bounce.second + r)
          lineTo(bounce.first - r, bounce.second)
          close()
        }
        canvas.drawPath(diamond, stroke)
      } else {
        fill.color = accent
        canvas.drawCircle(bounce.first, bounce.second, 7f * s, fill)
      }
      label(canvas, "Bounce", bounce, s)
      // Beside the plate, on the side away from the marks.
      val pathY = if (plateTop == 0f) plateHeight + 12f * s else plateTop - 12f * s - 30f * s
      plate(canvas, request.pathText, 16f * s, pathY, s)
    }

    drawReading(canvas, plateTop, plateHeight, s)
  }

  /** Whether the range and "Average speed, release to bounce" share one line. */
  private fun rangeFits(canvas: Canvas, s: Float): Boolean {
    regular.textSize = 24f * s
    val range = regular.measureText(request.rangeText)
    regular.textSize = 18f * s
    return 16f * s + range + 16f * s + regular.measureText(request.methodText) + 16f * s <= canvas.width
  }

  private fun plateHeight(canvas: Canvas, s: Float): Float {
    var h = 14f * s + 44f * s + 10f * s
    if (request.watermark) h += 30f * s + 10f * s
    h += 26f * s
    if (!rangeFits(canvas, s)) h += 24f * s
    return h + 12f * s
  }

  /** The speed, the strip on a free export, then its range and what it is. Opaque, full width. */
  private fun drawReading(canvas: Canvas, top: Float, height: Float, s: Float) {
    val oneLine = rangeFits(canvas, s)
    fill.color = bg
    canvas.drawRect(0f, top, canvas.width.toFloat(), top + height, fill)
    val x = 16f * s
    var y = top + 14f * s
    bold.color = accent
    bold.textSize = 44f * s
    bold.textAlign = Paint.Align.LEFT
    canvas.drawText(request.speedText, x, y + 36f * s, bold)
    y += 44f * s + 10f * s
    if (request.watermark) {
      // Edge to edge between the speed and its range, so cropping it cuts the reading.
      fill.color = fg
      canvas.drawRect(0f, y, canvas.width.toFloat(), y + 30f * s, fill)
      bold.color = bg
      bold.textSize = 18f * s
      bold.textAlign = Paint.Align.CENTER
      canvas.drawText(request.stripText, canvas.width / 2f, y + 21f * s, bold)
      bold.textAlign = Paint.Align.LEFT
      y += 30f * s + 10f * s
    }
    regular.color = fg
    regular.textSize = 24f * s
    val rangeWidth = regular.measureText(request.rangeText)
    canvas.drawText(request.rangeText, x, y + 20f * s, regular)
    regular.color = muted
    regular.textSize = 18f * s
    if (oneLine) {
      canvas.drawText(request.methodText, x + rangeWidth + 16f * s, y + 20f * s, regular)
    } else {
      canvas.drawText(request.methodText, x, y + 26f * s + 18f * s, regular)
    }
  }

  private fun ring(canvas: Canvas, p: Pair<Float, Float>, s: Float) {
    fill.color = bg
    canvas.drawCircle(p.first, p.second, 12f * s, fill)
  }

  /** A label on an opaque plate above its mark, or below it when there is no room. */
  private fun label(canvas: Canvas, text: String, p: Pair<Float, Float>, s: Float) {
    regular.textSize = 18f * s
    val w = regular.measureText(text) + 12f * s
    val h = 30f * s
    val above = p.second - 18f * s - h
    plate(canvas, text, p.first - w / 2f, if (above >= 0f) above else p.second + 18f * s, s)
  }

  /** Text on an opaque plate, kept inside the frame. */
  private fun plate(canvas: Canvas, text: String, left: Float, top: Float, s: Float) {
    regular.textSize = 18f * s
    regular.color = fg
    val w = regular.measureText(text) + 12f * s
    val h = 30f * s
    val x = left.coerceIn(0f, max(0f, canvas.width - w))
    val y = top.coerceIn(0f, max(0f, canvas.height - h))
    fill.color = bg
    canvas.drawRect(x, y, x + w, y + h, fill)
    canvas.drawText(text, x + 6f * s, y + 21f * s, regular)
  }

  private fun map(x: Double, y: Double, canvas: Canvas): Pair<Float, Float> {
    val fromRatio = request.coordinateWidth.toDouble() / request.coordinateHeight
    val toRatio = canvas.width.toDouble() / canvas.height
    if (abs(fromRatio / toRatio - 1.0) <= 0.02) {
      coordinateMode = "display-oriented"
      return Pair(
        (x / request.coordinateWidth * canvas.width).toFloat(),
        (y / request.coordinateHeight * canvas.height).toFloat(),
      )
    }
    if (abs(fromRatio * toRatio - 1.0) <= 0.02 && sourceRotation == 90) {
      coordinateMode = "inverse-rotation-90"
      return Pair(
        (y / request.coordinateHeight * canvas.width).toFloat(),
        (canvas.height - x / request.coordinateWidth * canvas.height).toFloat(),
      )
    }
    if (abs(fromRatio * toRatio - 1.0) <= 0.02 && sourceRotation == 270) {
      coordinateMode = "inverse-rotation-270"
      return Pair(
        (canvas.width - y / request.coordinateHeight * canvas.width).toFloat(),
        (x / request.coordinateWidth * canvas.height).toFloat(),
      )
    }
    throw IllegalArgumentException(
      "Overlay coordinates ${request.coordinateWidth}x${request.coordinateHeight} do not match ${canvas.width}x${canvas.height}."
    )
  }

  /**
   * The overlay may be invoked before or after Media3 applies display rotation,
   * depending on the source. Accept either source orientation, then `map`
   * chooses the matching transform for the display-oriented marking frame.
   */
  private fun validateCanvas(canvas: Canvas) {
    val sourceRatio = request.sourceWidth.toDouble() / request.sourceHeight
    val canvasRatio = canvas.width.toDouble() / canvas.height
    val same = abs(sourceRatio / canvasRatio - 1.0) <= 0.02
    val rotated = abs(sourceRatio * canvasRatio - 1.0) <= 0.02
    if (!same && !rotated) {
      throw IllegalArgumentException(
        "Media3 canvas ${canvas.width}x${canvas.height} does not match source ${request.sourceWidth}x${request.sourceHeight}."
      )
    }
  }
}
