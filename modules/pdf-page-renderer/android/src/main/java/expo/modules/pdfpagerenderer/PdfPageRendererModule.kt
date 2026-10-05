package expo.modules.pdfpagerenderer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

// Renders PDF pages to PNG files in the app cache with Android's built-in PdfRenderer (pdfium).
// No extra dependencies and nothing leaves the device. The caller deletes each PNG after OCR.
class PdfPageRendererModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfPageRenderer")

    AsyncFunction("getPageCount") { uri: String ->
      openRenderer(uri) { it.pageCount }
    }

    AsyncFunction("renderPage") { uri: String, pageIndex: Int, dpi: Int ->
      openRenderer(uri) { renderer ->
        if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
          throw PdfRenderException("ERR_PAGE_RANGE", "Page $pageIndex out of range (0..${renderer.pageCount - 1})", null)
        }
        renderer.openPage(pageIndex).use { page ->
          // Page size is in points (1/72 inch). Cap the long side so a poster-sized page cannot exhaust memory.
          val scale = dpi / 72f
          var w = (page.width * scale).roundToInt()
          var h = (page.height * scale).roundToInt()
          val longest = max(w, h)
          if (longest > MAX_SIDE_PX) {
            val k = MAX_SIDE_PX.toFloat() / longest
            w = (w * k).roundToInt()
            h = (h * k).roundToInt()
          }
          val bitmap = Bitmap.createBitmap(max(1, w), max(1, h), Bitmap.Config.ARGB_8888)
          try {
            // PdfRenderer leaves unpainted areas transparent, and ML Kit reads transparent images as empty.
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val dir = File(appContext.cacheDirectory, "pdf-render").apply { mkdirs() }
            val out = File(dir, "${UUID.randomUUID()}.png")
            FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            mapOf("uri" to Uri.fromFile(out).toString(), "width" to bitmap.width, "height" to bitmap.height)
          } finally {
            bitmap.recycle()
          }
        }
      }
    }
  }

  private fun <T> openRenderer(uri: String, block: (PdfRenderer) -> T): T {
    val context = appContext.reactContext ?: throw PdfRenderException("ERR_NO_CONTEXT", "React context unavailable", null)
    val fd = try {
      when {
        uri.startsWith("content://") -> context.contentResolver.openFileDescriptor(Uri.parse(uri), "r")
        else -> ParcelFileDescriptor.open(File(Uri.parse(uri).path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      } ?: throw PdfRenderException("ERR_FILE_NOT_FOUND", "Cannot open $uri", null)
    } catch (e: java.io.FileNotFoundException) {
      throw PdfRenderException("ERR_FILE_NOT_FOUND", "Cannot open $uri", e)
    }
    val renderer = try {
      PdfRenderer(fd)
    } catch (e: SecurityException) {
      fd.close()
      throw PdfRenderException("ERR_PASSWORD_REQUIRED", "PDF is password protected", e)
    } catch (e: java.io.IOException) {
      fd.close()
      throw PdfRenderException("ERR_CORRUPT_PDF", "Cannot read PDF: ${e.message}", e)
    }
    // PdfRenderer.close() also closes the file descriptor.
    return renderer.use(block)
  }

  companion object {
    private const val MAX_SIDE_PX = 4000
  }
}

class PdfRenderException(code: String, message: String, cause: Throwable?) : CodedException(code, message, cause)
