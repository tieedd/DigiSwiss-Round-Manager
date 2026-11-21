package com.example

import android.app.Activity
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.messaging.FirebaseMessaging
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.common.InputImage
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import kotlin.math.max

class NativeBridge(
  private val activity: Activity,
  private val webView: WebView,
  private val onPickQrImage: () -> Unit = {},
  private val onRequestNotificationPermission: () -> Unit = {}
) {
  var lastDownloadId: Long = -1L
  var lastDownloadedFileName: String = ""

  @Volatile
  private var pendingQrPickRequestId: String? = null

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


  @JavascriptInterface
  fun getLatestReleaseTag(): String {
    val result = JSONObject()
    var connection: HttpURLConnection? = null
    try {
      val url = URL("https://github.com/tieedd/DigiSwiss-Round-Manager/releases/latest")
      connection = (url.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 8000
        readTimeout = 8000
        requestMethod = "GET"
        setRequestProperty("User-Agent", "DigiSwiss-Round-Android")
      }
      connection.connect()
      val code = connection.responseCode
      val location = connection.getHeaderField("Location") ?: ""
      if (location.isNotEmpty()) {
        val marker = "/releases/tag/"
        val idx = location.indexOf(marker)
        if (idx != -1) {
          val tag = location.substring(idx + marker.length).substringBefore("?").substringBefore("#").trim()
          if (tag.isNotEmpty()) {
            result.put("ok", true)
            result.put("tag", tag)
            result.put("location", location)
            return result.toString()
          }
        }
      }
      result.put("ok", false)
      result.put("message", "Tag tidak ditemukan dari Location header (HTTP $code)")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal mengambil tag rilis terbaru")
      return result.toString()
    } finally {
      try {
        connection?.disconnect()
      } catch (_: Exception) {}
    }
  }

  @JavascriptInterface
  fun getNativeVersion(): String {
    return try {
      val pInfo = activity.packageManager.getPackageInfo(activity.packageName, 0)
      pInfo.versionName ?: "1.0"
    } catch (_: Exception) {
      "1.0"
    }
  }

  @JavascriptInterface
  fun fetchOtaManifest(): String {
    val res = OtaManager.fetchManifest()
    return res.toString()
  }

  @JvmOverloads
  @JavascriptInterface
  fun downloadOtaBundle(version: String, expectedSha256: String = ""): String {
    val res = OtaManager.downloadAndExtractBundle(activity, version, expectedSha256) { progress, received, total ->
      val detail = JSONObject().apply {
        put("type", "ota-download-progress")
        put("progress", progress)
        put("receivedBytes", received)
        put("totalBytes", total)
        put("version", version)
      }
      dispatchNativeEvent("ota-download-progress", detail)
    }

    val ok = res.optBoolean("ok", false)
    val detail = JSONObject().apply {
      put("type", if (ok) "ota-download-complete" else "ota-download-failed")
      put("ok", ok)
      put("version", version)
      put("message", res.optString("message"))
    }
    dispatchNativeEvent(if (ok) "ota-download-complete" else "ota-download-failed", detail)

    return res.toString()
  }

  @JavascriptInterface
  fun applyOta(): String {
    val result = JSONObject()
    try {
      val currentFile = OtaManager.getCurrentJsonFile(activity)
      if (!currentFile.exists()) {
        result.put("ok", false)
        result.put("message", "Paket OTA belum terpasang")
        return result.toString()
      }
      val json = JSONObject(currentFile.readText())
      val dirName = json.optString("dir")
      val indexFile = File(OtaManager.getOtaDir(activity), "$dirName/index.html")
      if (!indexFile.exists()) {
        result.put("ok", false)
        result.put("message", "index.html tidak ditemukan pada folder $dirName")
        return result.toString()
      }

      val url = indexFile.toURI().toString()
      activity.runOnUiThread {
        webView.loadUrl(url)
      }
      result.put("ok", true)
      result.put("message", "Memuat ulang aplikasi dengan paket OTA")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal memuat ulang paket OTA")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun markBootOk(): String {
    OtaManager.markBootOk(activity)
    val result = JSONObject().apply { put("ok", true) }
    return result.toString()
  }

  @JavascriptInterface
  fun resetToDefaultAssets(): String {
    val result = JSONObject()
    try {
      OtaManager.resetToDefault(activity)
      activity.runOnUiThread {
        webView.loadUrl(OtaManager.DEFAULT_ASSET_URL)
      }
      result.put("ok", true)
      result.put("message", "Kembali ke versi bawaan APK")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal kembali ke versi bawaan")
      return result.toString()
    }
  }

  @JavascriptInterface
  fun getCurrentOtaInfo(): String {
    return OtaManager.getCurrentOtaInfo(activity).toString()
  }

  private fun dispatchQrResult(
    requestId: String,
    ok: Boolean,
    text: String? = null,
    error: String? = null
  ) {
    val detail = JSONObject().apply {
      put("type", "qr-result")
      put("requestId", requestId)
      put("ok", ok)
      if (ok && text != null) {
        put("text", text)
      }
      if (!ok && error != null) {
        put("error", error)
      }
    }
    dispatchNativeEvent("qr-result", detail)
  }

  @JavascriptInterface
  fun scanQrCode(requestId: String) {
    activity.runOnUiThread {
      try {
        val gmsStatus = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity)
        if (gmsStatus != ConnectionResult.SUCCESS) {
          dispatchQrResult(requestId, ok = false, error = "unavailable")
          return@runOnUiThread
        }

        val options = GmsBarcodeScannerOptions.Builder()
          .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
          .enableAutoZoom()
          .build()
        val scanner = GmsBarcodeScanning.getClient(activity, options)

        scanner.startScan()
          .addOnSuccessListener { barcode ->
            val raw = barcode.rawValue?.trim().orEmpty()
            if (raw.isNotEmpty()) {
              dispatchQrResult(requestId, ok = true, text = raw)
            } else {
              dispatchQrResult(requestId, ok = false, error = "failed")
            }
          }
          .addOnCanceledListener {
            dispatchQrResult(requestId, ok = false, error = "cancelled")
          }
          .addOnFailureListener { e ->
            val msg = e.message.orEmpty()
            val isUnavailable = (e is MlKitException && e.errorCode == MlKitException.UNAVAILABLE) ||
              msg.contains("unavailable", ignoreCase = true) ||
              msg.contains("Google Play services", ignoreCase = true) ||
              msg.contains("API is not available", ignoreCase = true)
            dispatchQrResult(
              requestId,
              ok = false,
              error = if (isUnavailable) "unavailable" else "failed"
            )
          }
      } catch (e: Exception) {
        val msg = e.message.orEmpty()
        val isUnavailable = msg.contains("unavailable", ignoreCase = true) ||
          msg.contains("Google Play services", ignoreCase = true)
        dispatchQrResult(
          requestId,
          ok = false,
          error = if (isUnavailable) "unavailable" else "failed"
        )
      }
    }
  }

  @JavascriptInterface
  fun pickQrImage(requestId: String) {
    activity.runOnUiThread {
      try {
        pendingQrPickRequestId = requestId
        onPickQrImage()
      } catch (_: Exception) {
        pendingQrPickRequestId = null
        dispatchQrResult(requestId, ok = false, error = "failed")
      }
    }
  }

  fun onQrImagePicked(uri: Uri?) {
    val requestId = pendingQrPickRequestId
    pendingQrPickRequestId = null
    if (requestId.isNullOrEmpty()) return

    if (uri == null) {
      dispatchQrResult(requestId, ok = false, error = "cancelled")
      return
    }

    Thread {
      var decodedBitmap: Bitmap? = null
      try {
        decodedBitmap = decodeDownsampledBitmap(uri, maxDimension = 1600)
        val inputImage = if (decodedBitmap != null) {
          InputImage.fromBitmap(decodedBitmap, 0)
        } else {
          InputImage.fromFilePath(activity, uri)
        }

        val options = BarcodeScannerOptions.Builder()
          .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
          .build()
        val scanner = BarcodeScanning.getClient(options)

        scanner.process(inputImage)
          .addOnSuccessListener { barcodes ->
            val raw = barcodes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue?.trim().orEmpty()
            if (raw.isNotEmpty()) {
              dispatchQrResult(requestId, ok = true, text = raw)
            } else {
              dispatchQrResult(requestId, ok = false, error = "no_qr")
            }
          }
          .addOnFailureListener {
            dispatchQrResult(requestId, ok = false, error = "failed")
          }
          .addOnCompleteListener {
            try {
              scanner.close()
            } catch (_: Exception) {}
            try {
              decodedBitmap?.recycle()
            } catch (_: Exception) {}
          }
      } catch (_: Exception) {
        try {
          decodedBitmap?.recycle()
        } catch (_: Exception) {}
        dispatchQrResult(requestId, ok = false, error = "failed")
      }
    }.start()
  }

  private fun decodeDownsampledBitmap(uri: Uri, maxDimension: Int): Bitmap? {
    val resolver = activity.contentResolver
    val bounds = BitmapFactory.Options().apply {
      inJustDecodeBounds = true
    }
    resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, bounds)
    }

    val srcW = bounds.outWidth
    val srcH = bounds.outHeight
    if (srcW <= 0 || srcH <= 0) {
      return null
    }

    var sampleSize = 1
    val largest = max(srcW, srcH)
    while (largest / sampleSize > maxDimension) {
      sampleSize *= 2
    }

    val decodeOpts = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val sampled = resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, decodeOpts)
    } ?: return null

    val curMax = max(sampled.width, sampled.height)
    if (curMax > maxDimension) {
      val scale = maxDimension.toFloat() / curMax.toFloat()
      val targetW = max(1, (sampled.width * scale).toInt())
      val targetH = max(1, (sampled.height * scale).toInt())
      val scaled = Bitmap.createScaledBitmap(sampled, targetW, targetH, true)
      if (scaled !== sampled) {
        sampled.recycle()
      }
      return scaled
    }
    return sampled
  }

  @JavascriptInterface
  fun shareImage(fileName: String, base64Png: String, caption: String): String {
    val result = JSONObject()
    try {
      val sanitizedBase = sanitizeFileName(fileName)
      if (sanitizedBase.isEmpty()) {
        result.put("ok", false)
        result.put("message", "Nama file tidak valid")
        return result.toString()
      }
      val finalName = if (sanitizedBase.endsWith(".png", ignoreCase = true)) {
        sanitizedBase
      } else {
        "$sanitizedBase.png"
      }

      val cleanBase64 = if (base64Png.contains(",")) {
        base64Png.substringAfter(",")
      } else {
        base64Png
      }
      val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
      val maxBytes = 10 * 1024 * 1024
      if (bytes.isEmpty() || bytes.size > maxBytes) {
        result.put("ok", false)
        result.put("message", "Ukuran gambar tidak valid atau melebihi 10MB")
        return result.toString()
      }

      val sharedDir = File(activity.cacheDir, "shared")
      if (!sharedDir.exists()) {
        sharedDir.mkdirs()
      }
      val outFile = File(sharedDir, finalName)
      FileOutputStream(outFile).use { fos ->
        fos.write(bytes)
        fos.flush()
      }

      val contentUri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.fileprovider",
        outFile
      )

      val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, contentUri)
        if (caption.trim().isNotEmpty()) {
          putExtra(Intent.EXTRA_TEXT, caption.trim())
        }
        clipData = ClipData.newRawUri("", contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      activity.runOnUiThread {
        val chooser = Intent.createChooser(sendIntent, "Bagikan Kartu QR Undangan")
        activity.startActivity(chooser)
      }

      result.put("ok", true)
      result.put("message", "Membuka menu berbagi...")
      return result.toString()
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal membagikan gambar")
      return result.toString()
    }
  }

  private fun computeNotificationPermissionJson(): JSONObject {
    val detail = JSONObject()
    detail.put("type", "notification-permission")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        activity,
        android.Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      val state = if (granted) {
        "granted"
      } else {
        val rationale = ActivityCompat.shouldShowRequestPermissionRationale(
          activity,
          android.Manifest.permission.POST_NOTIFICATIONS
        )
        val askedBefore = PushRuntimeState.wasPermissionAsked(activity)
        when {
          !askedBefore -> "prompt"
          rationale -> "denied"
          else -> "permanently_denied"
        }
      }
      detail.put("state", state)
      detail.put("granted", granted)
      detail.put("canRequest", !granted && state != "permanently_denied")
    } else {
      val enabled = NotificationManagerCompat.from(activity).areNotificationsEnabled()
      detail.put("state", if (enabled) "granted" else "denied")
      detail.put("granted", enabled)
      detail.put("canRequest", false)
    }
    return detail
  }

  @JavascriptInterface
  fun getNotificationPermissionState() {
    activity.runOnUiThread {
      try {
        dispatchNativeEvent("notification-permission", computeNotificationPermissionJson())
      } catch (e: Exception) {
        val detail = JSONObject().apply {
          put("type", "notification-permission")
          put("state", "denied")
          put("granted", false)
          put("canRequest", false)
          put("error", e.message ?: "failed")
        }
        dispatchNativeEvent("notification-permission", detail)
      }
    }
  }

  @JavascriptInterface
  fun requestNotificationPermission() {
    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          val granted = ContextCompat.checkSelfPermission(
            activity,
            android.Manifest.permission.POST_NOTIFICATIONS
          ) == PackageManager.PERMISSION_GRANTED
          if (granted) {
            dispatchNativeEvent("notification-permission", computeNotificationPermissionJson())
          } else {
            PushRuntimeState.markPermissionAsked(activity)
            onRequestNotificationPermission()
          }
        } else {
          dispatchNativeEvent("notification-permission", computeNotificationPermissionJson())
        }
      } catch (e: Exception) {
        val detail = JSONObject().apply {
          put("type", "notification-permission")
          put("state", "denied")
          put("granted", false)
          put("canRequest", false)
          put("error", e.message ?: "failed")
        }
        dispatchNativeEvent("notification-permission", detail)
      }
    }
  }

  fun onNotificationPermissionResult(granted: Boolean) {
    val detail = computeNotificationPermissionJson().apply {
      put("granted", granted)
      if (granted) {
        put("state", "granted")
        put("canRequest", false)
      }
    }
    dispatchNativeEvent("notification-permission", detail)
  }

  @JavascriptInterface
  fun getFcmToken() {
    try {
      FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token ->
          val clean = token?.trim().orEmpty()
          if (clean.isNotEmpty()) {
            PushRuntimeState.saveFcmToken(activity.applicationContext, clean)
            val detail = JSONObject().apply {
              put("type", "fcm-token")
              put("ok", true)
              put("token", clean)
            }
            dispatchNativeEvent("fcm-token", detail)
          } else {
            dispatchCachedOrFailedToken("Token kosong")
          }
        }
        .addOnFailureListener { e ->
          dispatchCachedOrFailedToken(e.message ?: "Gagal mengambil token FCM")
        }
    } catch (e: Exception) {
      dispatchCachedOrFailedToken(e.message ?: "FCM tidak tersedia")
    }
  }

  private fun dispatchCachedOrFailedToken(errorMessage: String) {
    val cached = PushRuntimeState.getSavedFcmToken(activity.applicationContext)
    if (cached.isNotEmpty()) {
      val detail = JSONObject().apply {
        put("type", "fcm-token")
        put("ok", true)
        put("token", cached)
      }
      dispatchNativeEvent("fcm-token", detail)
      return
    }
    val detail = JSONObject().apply {
      put("type", "fcm-token")
      put("ok", false)
      put("error", errorMessage)
    }
    dispatchNativeEvent("fcm-token", detail)
  }

  @JavascriptInterface
  fun markPushWebReady() {
    PushRuntimeState.markWebReadyAndFlush()
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
          val lower = path.lowercase()
          lower.startsWith("/tieedd/digiswiss-round-manager/") &&
            lower.contains("/releases/download/") &&
            lower.endsWith(".apk")
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
