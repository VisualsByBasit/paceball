package expo.modules.frameextractor

import android.graphics.Bitmap
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * The video track's own duration in microseconds, or null if the file does not
 * say. METADATA_KEY_DURATION is the container's, which is the longest track, and
 * a sound track routinely runs a little past the last frame. Dividing the frame
 * count by that would read the fps low on every clip recorded with sound.
 */
private fun videoTrackDurationUs(path: String): Long? {
  val extractor = MediaExtractor()
  return try {
    extractor.setDataSource(path)
    (0 until extractor.trackCount)
      .map { extractor.getTrackFormat(it) }
      .firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
      ?.takeIf { it.containsKey(MediaFormat.KEY_DURATION) }
      ?.getLong(MediaFormat.KEY_DURATION)
      ?.takeIf { it > 0 }
  } catch (e: Exception) {
    null
  } finally {
    extractor.release()
  }
}

class FrameExtractorModule : Module() {
  private var videoExporter: VideoExporter? = null

  private fun exporter(): VideoExporter = videoExporter ?: VideoExporter(
      appContext.reactContext ?: throw Exceptions.ReactContextLost(),
      progress = { sendEvent("onVideoExportProgress", it) },
    ).also { videoExporter = it }

  override fun definition() = ModuleDefinition {
    Name("FrameExtractor")
    Events("onVideoExportProgress")

    AsyncFunction("getVideoInfo") { path: String ->
      val r = MediaMetadataRetriever()
      try {
        val file = path.removePrefix("file://")
        r.setDataSource(file)

        // Everything here is read off the video track, so a sound track in the
        // same file changes none of it. The container duration is only a
        // fallback for a file whose video track does not state its own.
        val containerMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        val durationUs = videoTrackDurationUs(file) ?: (containerMs * 1000L)
        val durationMs = durationUs / 1000L
        val frameCount = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull() ?: 0
        val width = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val height = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotationDegrees = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        val captureFps = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toFloatOrNull()

        val derivedFps = if (durationUs > 0 && frameCount > 0)
          (frameCount.toDouble() / (durationUs / 1_000_000.0)).toFloat() else 0f

        mapOf(
          "frameCount" to frameCount,
          "durationMs" to durationMs,
          "width" to width,
          "height" to height,
          "rotationDegrees" to rotationDegrees,
          "captureFps" to (captureFps ?: 0f),
          "derivedFps" to derivedFps
        )
      } finally {
        r.release()
      }
    }

    // Returns a JPEG path per frame decoded, in index order. May return FEWER paths
    // than `count`: METADATA_KEY_VIDEO_FRAME_COUNT is a container hint and routinely
    // over-reports by a frame or two, and getFrameAtIndex throws rather than returning
    // null once the index runs past what the decoder will actually produce. Callers
    // treat a short list as "that is where the video really ends", not as an error.
    //
    // `maxWidth` downscales the long edge before encoding; 0 or null keeps full size.
    AsyncFunction("extractFrames") {
      path: String, startIndex: Int, count: Int, outDir: String, maxWidth: Int? ->

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
        throw IllegalStateException(
          "Frame-accurate extraction needs Android 9 (API 28) or newer; this device is API ${Build.VERSION.SDK_INT}."
        )
      }

      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(path.removePrefix("file://"))

        val dir = File(outDir.removePrefix("file://"))
        if (!dir.exists()) dir.mkdirs()

        val cap = maxWidth ?: 0
        val paths = mutableListOf<String>()

        for (i in 0 until count) {
          val index = startIndex + i

          val frame: Bitmap = try {
            r.getFrameAtIndex(index) ?: break
          } catch (e: Exception) {
            // Past the end of the decodable range — hand back what we have.
            break
          }

          // Scale to the cap so a 4K clip does not cost 4K of decode, encode and disk
          // for a frame that is only ever shown at phone width.
          val longEdge = maxOf(frame.width, frame.height)
          val bitmap = if (cap > 0 && longEdge > cap) {
            val ratio = cap.toFloat() / longEdge
            val scaled = Bitmap.createScaledBitmap(
              frame,
              maxOf(1, (frame.width * ratio).toInt()),
              maxOf(1, (frame.height * ratio).toInt()),
              true
            )
            if (scaled !== frame) frame.recycle()
            scaled
          } else {
            frame
          }

          val out = File(dir, "frame_%05d.jpg".format(index))
          try {
            FileOutputStream(out).use { fos ->
              bitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
            }
          } finally {
            bitmap.recycle()
          }
          paths.add("file://" + out.absolutePath)
        }

        paths
      } finally {
        r.release()
      }
    }

    AsyncFunction("exportVideo") { request: VideoExportRequest, promise: Promise ->
      exporter().start(request, promise)
    }

    AsyncFunction("cancelVideoExport") { exportId: String, promise: Promise ->
      exporter().cancel(exportId, promise)
    }

    OnDestroy {
      // Do not instantiate the encoder while the React context is being torn
      // down if this app lifetime never used video export.
      videoExporter?.destroy()
      videoExporter = null
    }
  }
}
