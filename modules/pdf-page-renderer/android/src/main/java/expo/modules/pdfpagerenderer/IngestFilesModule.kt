package expo.modules.pdfpagerenderer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import android.view.WindowManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

// File helpers for ingestion, next to the PDF renderer so they share one local module and build:
// - prepareImage: camera and gallery images to an upright, white-backed JPEG for ML Kit.
// - sha256: hash of a picked file for duplicate detection, streamed with the platform MessageDigest.
// - setSecure: FLAG_SECURE on the activity while a screen shows report contents.
class IngestFilesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IngestFiles")

    AsyncFunction("prepareImage") { uri: String, maxSide: Int ->
      // First pass reads only the size, so the decode below can subsample a large photo.
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      open(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw IngestFileException("ERR_NOT_AN_IMAGE", "Cannot read $uri as an image", null)
      }
      var sample = 1
      while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2

      val orientation = try {
        open(uri).use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
      } catch (e: Exception) {
        ExifInterface.ORIENTATION_NORMAL
      }
      val src = open(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: throw IngestFileException("ERR_NOT_AN_IMAGE", "Cannot decode $uri", null)

      try {
        val m = orientationMatrix(orientation)
        val scale = minOf(1f, maxSide.toFloat() / max(src.width, src.height))
        m.postScale(scale, scale)
        // Map the source rect to find the output size after rotation and scaling, then move it to 0,0.
        val rect = android.graphics.RectF(0f, 0f, src.width.toFloat(), src.height.toFloat())
        m.mapRect(rect)
        m.postTranslate(-rect.left, -rect.top)
        val out = Bitmap.createBitmap(max(1, rect.width().roundToInt()), max(1, rect.height().roundToInt()), Bitmap.Config.ARGB_8888)
        try {
          // ML Kit reads transparent pixels as empty, so flatten any alpha onto white.
          out.eraseColor(Color.WHITE)
          Canvas(out).drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG))
          val dir = File(appContext.cacheDirectory, "ingest-image").apply { mkdirs() }
          val file = File(dir, "${UUID.randomUUID()}.jpg")
          FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 95, it) }
          mapOf("uri" to Uri.fromFile(file).toString(), "width" to out.width, "height" to out.height)
        } finally {
          out.recycle()
        }
      } finally {
        src.recycle()
      }
    }

    AsyncFunction("sha256") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      open(uri).use { input ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          digest.update(buf, 0, n)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it) }
    }

    AsyncFunction("setSecure") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      activity.runOnUiThread {
        if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      }
    }
  }

  private fun open(uri: String): InputStream {
    val context = appContext.reactContext ?: throw IngestFileException("ERR_NO_CONTEXT", "React context unavailable", null)
    return try {
      if (uri.startsWith("content://")) {
        context.contentResolver.openInputStream(Uri.parse(uri))
      } else {
        FileInputStream(File(Uri.parse(uri).path ?: uri))
      } ?: throw IngestFileException("ERR_FILE_NOT_FOUND", "Cannot open $uri", null)
    } catch (e: java.io.FileNotFoundException) {
      throw IngestFileException("ERR_FILE_NOT_FOUND", "Cannot open $uri", e)
    }
  }

  private fun orientationMatrix(orientation: Int) = Matrix().apply {
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(-90f); postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(-90f)
    }
  }
}

class IngestFileException(code: String, message: String, cause: Throwable?) : CodedException(code, message, cause)
