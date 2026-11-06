package com.example

import android.app.Activity
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.URI

class NativeBridge(
  private val activity: Activity,
  private val webView: WebView
) {
  var lastDownloadId: Long = -1L
  var lastDownloadedFileName: String = ""

  fun dispatchNativeEvent(type: String, detailJson: JSONObject) {
    activity.runOnUiThread {
      val eventJs = """
        (function() {
          try {
            var detail = ${detailJson.toString()};
            var evt = new CustomEvent('digiswiss-native', { detail: detail });
            window.dispatchEvent(evt);
          } catch(e) {
            console.error('Error dispatching native event', e);
          }
        })();
      """.trimIndent()
      webView.evaluateJavascript(eventJs, null)
    }
  }

  @JavascriptInterface
  fun saveFile(fileName: String, mimeType: String, base64Data: String): String {
    val result = JSONObject()
    try {
      val sanitized = sanitizeFileName(fileName)
      if (sanitized.isEmpty()) {
        result.put("ok", false)
        result.put("message", "Nama file tidak valid")
        return result.toString()
      }

      val allowedMimes = setOf("image/png", "text/csv", "text/plain")
      if (!allowedMimes.contains(mimeType.lowercase().trim())) {
        result.put("ok", false)
        result.put("message", "Tipe file tidak diizinkan")
        return result.toString()
      }

      val cleanBase64 = if (base64Data.contains(",")) {
        base64Data.substringAfter(",")
      } else {
        base64Data
      }
      val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
      val maxBytes = 10 * 1024 * 1024 // 10MB
      if (bytes.size > maxBytes) {
        result.put("ok", false)
        result.put("message", "Ukuran file melebihi batas 10MB")
        return result.toString()
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val contentValues = android.content.ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, sanitized)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/DigiSwiss-Round")
        }
        val resolver = activity.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri == null) {
          result.put("ok", false)
          result.put("message", "Gagal membuat file di folder Unduhan")
          return result.toString()
        }
        resolver.openOutputStream(uri)?.use { os ->
          os.write(bytes)
          os.flush()
        }
        result.put("ok", true)
        result.put("message", "File tersimpan di folder Unduhan/DigiSwiss-Round/$sanitized")
        result.put("fileName", sanitized)
        return result.toString()
      } else {
        val permissionCheck = ContextCompat.checkSelfPermission(
          activity,
          android.Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
        if (permissionCheck != PackageManager.PERMISSION_GRANTED) {
          activity.requestPermissions(
            arrayOf(android.Manifest.permission.WRITE_EXTERNAL_STORAGE),
            REQUEST_CODE_STORAGE
          )
          result.put("ok", false)
          result.put("message", "Izin penyimpanan diperlukan")
          return result.toString()
        }

        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val appFolder = File(downloadsDir, "DigiSwiss-Round")
        if (!appFolder.exists()) {
          appFolder.mkdirs()
        }
        val targetFile = File(appFolder, sanitized)
        FileOutputStream(targetFile).use { fos ->
          fos.write(bytes)
          fos.flush()
        }
        result.put("ok", true)
        result.put("message", "File tersimpan di ${targetFile.absolutePath}")
        result.put("fileName", sanitized)
        return result.toString()
      }
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Terjadi kesalahan saat menyimpan file")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun copyText(text: String): String {
    val result = JSONObject()
    try {
      activity.runOnUiThread {
        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("DigiSwiss-Round", text)
        clipboard.setPrimaryClip(clip)
      }
      result.put("ok", true)
      result.put("message", "Teks berhasil disalin ke papan klip")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal menyalin teks")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun downloadApk(url: String, fileName: String): String {
    val result = JSONObject()
    try {
      if (!isAllowedApkUrl(url)) {
        result.put("ok", false)
        result.put("message", "URL unduhan tidak valid atau tidak diizinkan")
        return result.toString()
      }

      val sanitizedFileName = sanitizeFileName(fileName).let {
        if (it.endsWith(".apk", ignoreCase = true)) it else "$it.apk"
      }

      val request = DownloadManager.Request(Uri.parse(url)).apply {
        setTitle(sanitizedFileName)
        setDescription("Mengunduh pembaruan DigiSwiss-Round")
        setMimeType("application/vnd.android.package-archive")
        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, sanitizedFileName)
        setAllowedOverMetered(true)
        setAllowedOverRoaming(true)
      }

      val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val id = dm.enqueue(request)
      lastDownloadId = id
      lastDownloadedFileName = sanitizedFileName

      val detail = JSONObject().apply {
        put("type", "download-started")
        put("fileName", sanitizedFileName)
        put("downloadId", id)
      }
      dispatchNativeEvent("download-started", detail)

      result.put("ok", true)
      result.put("message", "Unduhan APK dimulai")
      result.put("downloadId", id)
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal memulai unduhan APK")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun installApk(): String {
    val result = JSONObject()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (!activity.packageManager.canRequestPackageInstalls()) {
          val detail = JSONObject().apply {
            put("type", "install-permission-needed")
            put("message", "Izin memasang aplikasi tidak dikenal diperlukan")
          }
          dispatchNativeEvent("install-permission-needed", detail)

          val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${activity.packageName}")
          }
          activity.startActivity(intent)

          result.put("ok", false)
          result.put("message", "Izin memasang aplikasi diperlukan")
          return result.toString()
        }
      }

      val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      if (lastDownloadId == -1L) {
        result.put("ok", false)
        result.put("message", "Tidak ada file unduhan APK sebelumnya")
        return result.toString()
      }

      val fileUri = dm.getUriForDownloadedFile(lastDownloadId)
      if (fileUri == null) {
        result.put("ok", false)
        result.put("message", "File unduhan APK tidak ditemukan")
        return result.toString()
      }

      val installIntent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(fileUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(installIntent)

      result.put("ok", true)
      result.put("message", "Memulai instalasi APK")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal memasang APK")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun openExternal(url: String): String {
    val result = JSONObject()
    try {
      val parsed = Uri.parse(url)
      if (parsed.scheme?.lowercase() != "https") {
        result.put("ok", false)
        result.put("message", "Hanya skema HTTPS yang diizinkan untuk tautan eksternal")
        return result.toString()
      }
      val intent = Intent(Intent.ACTION_VIEW, parsed).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      result.put("ok", true)
      result.put("message", "Tautan dibuka di browser sistem")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal membuka tautan eksternal")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun setSystemBarsStyle(isDark: Boolean): String {
    val result = JSONObject()
    try {
      activity.runOnUiThread {
        val window = activity.window
        val insetsController = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = !isDark
        insetsController.isAppearanceLightNavigationBars = !isDark

        val statusBarColor = if (isDark) android.graphics.Color.parseColor("#0B0F14") else android.graphics.Color.parseColor("#F6F8FB")
        val navBarColor = if (isDark) android.graphics.Color.parseColor("#0B0F14") else android.graphics.Color.parseColor("#F6F8FB")
        window.statusBarColor = statusBarColor
        window.navigationBarColor = navBarColor
        webView.setBackgroundColor(statusBarColor)
      }
      result.put("ok", true)
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal mengubah gaya system bars")
      return result.toString()
    }
  }


  companion object {
    const val REQUEST_CODE_STORAGE = 1001

    fun sanitizeFileName(name: String): String {
      val clean = name
        .replace("../", "")
        .replace("..\\", "")
        .replace("/", "_")
        .replace("\\", "_")
        .trim()
      val sanitized = clean
        .replace(Regex("[^a-zA-Z0-9._-]"), "_")
        .replace(Regex("_+"), "_")
        .trim('_')
      return if (sanitized.isEmpty()) "file" else sanitized
    }

    fun isAllowedApkUrl(url: String): Boolean {
      return try {
        val uri = URI(url)
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        val path = uri.path ?: ""
        if (scheme != "https") return false
        if (host == "github.com") {
          path.contains("/releases/download/") && path.endsWith(".apk", ignoreCase = true)
        } else if (host == "objects.githubusercontent.com") {
          true
        } else {
          false
        }
      } catch (_: Exception) {
        false
      }
    }
  }
}
