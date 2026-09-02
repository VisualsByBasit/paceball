package expo.modules.frameextractor

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class FrameExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FrameExtractor")

    AsyncFunction("getVideoInfo") { path: String ->
      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(path.removePrefix("file://"))

        val durationMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        val frameCount = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull() ?: 0
        val width = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val height = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val captureFps = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toFloatOrNull()

        val derivedFps = if (durationMs > 0 && frameCount > 0)
          frameCount.toFloat() / (durationMs / 1000f) else 0f

        mapOf(
          "frameCount" to frameCount,
          "durationMs" to durationMs,
          "width" to width,
          "height" to height,
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
  }
}
