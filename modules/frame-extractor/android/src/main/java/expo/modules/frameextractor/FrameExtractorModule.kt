package expo.modules.frameextractor

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
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

    AsyncFunction("extractFrames") { path: String, startIndex: Int, count: Int, outDir: String ->
      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(path.removePrefix("file://"))

        val dir = File(outDir.removePrefix("file://"))
        if (!dir.exists()) dir.mkdirs()

        val paths = mutableListOf<String>()

        for (i in 0 until count) {
          val index = startIndex + i
          val bitmap: Bitmap = r.getFrameAtIndex(index) ?: continue

          val out = File(dir, "frame_%05d.jpg".format(index))
          FileOutputStream(out).use { fos ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
          }
          bitmap.recycle()
          paths.add("file://" + out.absolutePath)
        }

        paths
      } finally {
        r.release()
      }
    }
  }
}
