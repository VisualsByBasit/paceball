package expo.modules.frameextractor

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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
import androidx.media3.effect.OverlayEffect
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
import kotlin.math.min
import kotlin.math.roundToInt

class VideoExportRequest : Record {
  @Field lateinit var exportId: String
  @Field lateinit var inputPath: String
  @Field lateinit var outputPath: String
  @Field var clipStartMs: Long = 0
  @Field var clipEndMs: Long = 0
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
  @Field var releaseAtMs: Long = 0
  @Field var bounceAtMs: Long = 0
  @Field var speedKmh: Double = 0.0
  @Field var errorKmh: Double = 0.0
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
        val edited = EditedMediaItem.Builder(mediaItem)
          .setRemoveAudio(!request.includeAudio)
          .setEffects(Effects(emptyList(), listOf(OverlayEffect(listOf(overlay)))))
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
    if (request.releaseAtMs < 0 || request.bounceAtMs <= request.releaseAtMs ||
      request.bounceAtMs > request.clipEndMs - request.clipStartMs) {
      throw IllegalArgumentException("Video export marks fall outside the trimmed clip.")
    }
    if (!request.speedKmh.isFinite() || request.speedKmh <= 0 ||
      !request.errorKmh.isFinite() || request.errorKmh < 0) {
      throw IllegalArgumentException("Video export needs a measured speed and error range.")
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

/** Draws only marks the user actually made; it never implies tracked positions. */
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

  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(212, 255, 63)
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }
  private val point = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(212, 255, 63)
    style = Paint.Style.FILL
  }
  private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
  }
  private val muted = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(220, 220, 224, 228)
    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
  }
  private val panel = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(185, 10, 11, 13)
    style = Paint.Style.FILL
  }

  override fun onDraw(canvas: Canvas, presentationTimeUs: Long) {
    canvasWidth = canvas.width
    canvasHeight = canvas.height
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    validateCanvas(canvas)
    val scale = min(canvas.width, canvas.height) / 720f
    line.strokeWidth = 3.5f * scale

    val a = map(request.calAX, request.calAY, canvas)
    val b = map(request.calBX, request.calBY, canvas)
    val release = map(request.releaseX, request.releaseY, canvas)
    val bounce = map(request.bounceX, request.bounceY, canvas)
    canvas.drawLine(a.first, a.second, b.first, b.second, line)
    canvas.drawLine(release.first, release.second, bounce.first, bounce.second, line)
    for (p in listOf(a, b, release, bounce)) canvas.drawCircle(p.first, p.second, 7f * scale, point)

    val timeMs = presentationTimeUs / 1_000.0
    val fraction = when {
      timeMs <= request.releaseAtMs -> 0.0
      timeMs >= request.bounceAtMs -> 1.0
      else -> (timeMs - request.releaseAtMs) / (request.bounceAtMs - request.releaseAtMs)
    }
    val shownSpeed = request.speedKmh * fraction
    val margin = 28f * scale
    val top = 28f * scale
    val panelWidth = 360f * scale
    val panelHeight = 126f * scale
    canvas.drawRoundRect(margin, top, margin + panelWidth, top + panelHeight, 12f * scale, 12f * scale, panel)
    muted.textSize = 18f * scale
    canvas.drawText("AVG SPEED TO BOUNCE", margin + 18f * scale, top + 30f * scale, muted)
    text.textSize = 43f * scale
    canvas.drawText("${shownSpeed.roundToInt()} KM/H", margin + 18f * scale, top + 78f * scale, text)
    muted.textSize = 18f * scale
    canvas.drawText("± ${request.errorKmh.roundToInt()} KM/H", margin + 18f * scale, top + 106f * scale, muted)

    muted.textSize = 14f * scale
    canvas.drawText("MARK-TO-MARK · NOT TRACKED", margin, canvas.height - 26f * scale, muted)
    if (request.watermark) {
      text.textSize = 22f * scale
      text.textAlign = Paint.Align.RIGHT
      canvas.drawText("PACEBALL", canvas.width - margin, canvas.height - 26f * scale, text)
      text.textAlign = Paint.Align.LEFT
    }
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
