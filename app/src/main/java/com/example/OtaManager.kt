package com.example

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream

object OtaManager {
  private const val TAG = "OtaManager"
  const val DEFAULT_ASSET_URL = "file:///android_asset/dist/index.html"
  private const val OTA_DIR_NAME = "ota"
  private const val CURRENT_JSON = "current.json"
  private const val PREFS_NAME = "ota_prefs"
  private const val PREF_BOOT_ATTEMPTS = "ota_boot_attempts"
  private const val MAX_BOOT_ATTEMPTS = 2
  private const val MAX_EXTRACT_BYTES = 50 * 1024 * 1024L // 50 MB
  private const val MAX_EXTRACT_ENTRIES = 1000
  private const val MANIFEST_URL = "https://github.com/tieedd/DigiSwiss-Round-Manager/releases/latest/download/manifest.json"

  private val VERSION_REGEX = Regex("""^\d+\.\d+\.\d+$""")
  private val SHA256_REGEX = Regex("""^[0-9a-fA-F]{64}$""")

  fun isValidVersion(version: String): Boolean {
    val clean = version.trim().removePrefix("v").removePrefix("V")
    return VERSION_REGEX.matches(clean)
  }

  fun getOtaDir(context: Context): File {
    return File(context.filesDir, OTA_DIR_NAME).apply {
      if (!exists()) mkdirs()
    }
  }

  fun getCurrentJsonFile(context: Context): File {
    return File(getOtaDir(context), CURRENT_JSON)
  }

  /**
   * Menentukan URL awal yang akan dimuat oleh WebView:
   * Jika current.json valid dan index.html ada, gunakan bundle OTA.
   * Jika crash 2x berturut-turut tanpa markBootOk(), rollback ke asset bawaan APK.
   */
  fun resolveInitialUrl(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val currentFile = getCurrentJsonFile(context)

    if (!currentFile.exists()) {
      prefs.edit().putInt(PREF_BOOT_ATTEMPTS, 0).apply()
      return DEFAULT_ASSET_URL
    }

    try {
      val raw = currentFile.readText()
      val json = JSONObject(raw)
      val version = json.optString("version")
      val cleanVer = version.trim().removePrefix("v").removePrefix("V")
      if (!VERSION_REGEX.matches(cleanVer)) {
        Log.w(TAG, "Versi pada current.json tidak valid: $version, kembali ke bawaan")
        resetToDefault(context)
        return DEFAULT_ASSET_URL
      }

      val dirName = json.optString("dir")
      if (dirName.isNullOrEmpty() || dirName != "web-$cleanVer") {
        Log.w(TAG, "Nama folder pada current.json tidak sesuai ($dirName vs web-$cleanVer), reset")
        resetToDefault(context)
        return DEFAULT_ASSET_URL
      }

      val indexFile = File(getOtaDir(context), "$dirName/index.html")
      if (!indexFile.exists()) {
        Log.w(TAG, "index.html tidak ditemukan pada folder OTA $dirName, kembali ke bawaan")
        resetToDefault(context)
        return DEFAULT_ASSET_URL
      }

      // Perlindungan gagal-muat: jika sudah 2x boot tanpa markBootOk, rollback otomatis
      val attempts = prefs.getInt(PREF_BOOT_ATTEMPTS, 0)
      if (attempts >= MAX_BOOT_ATTEMPTS) {
        Log.e(TAG, "Gagal muat OTA 2x berturut-turut tanpa markBootOk! Menghapus paket OTA dan kembali ke APK bawaan.")
        resetToDefault(context)
        // Hapus folder yang bermasalah
        val badDir = File(getOtaDir(context), dirName)
        if (badDir.exists()) badDir.deleteRecursively()
        return DEFAULT_ASSET_URL
      }

      // Tingkatkan counter boot attempt (akan direset ke 0 bila web memanggil markBootOk())
      prefs.edit().putInt(PREF_BOOT_ATTEMPTS, attempts + 1).apply()
      val fileUri = indexFile.toURI().toString()
      Log.i(TAG, "Memuat bundle OTA: $fileUri (boot attempt: ${attempts + 1})")
      return fileUri
    } catch (e: Exception) {
      Log.e(TAG, "Gagal memproses current.json", e)
      resetToDefault(context)
      return DEFAULT_ASSET_URL
    }
  }

  /**
   * Dipanggil oleh web setelah render awal berhasil untuk menandai boot sukses
   */
  fun markBootOk(context: Context) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().putInt(PREF_BOOT_ATTEMPTS, 0).apply()
    Log.i(TAG, "Boot OTA berhasil ditandai (counter direset ke 0)")
  }

  /**
   * Menghapus referensi OTA aktif dan kembali ke asset APK bawaan
   */
  fun resetToDefault(context: Context): Boolean {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().putInt(PREF_BOOT_ATTEMPTS, 0).apply()
    val currentFile = getCurrentJsonFile(context)
    if (currentFile.exists()) {
      currentFile.delete()
    }
    Log.i(TAG, "Pengaturan OTA direset ke bawaan APK")
    return true
  }

  /**
   * Mengambil manifest.json dari GitHub Release
   */
  fun fetchManifest(): JSONObject {
    val result = JSONObject()
    var connection: HttpURLConnection? = null
    try {
      val url = URL(MANIFEST_URL)
      val host = url.host.lowercase()
      if (host != "github.com" && !host.endsWith(".githubusercontent.com")) {
        result.put("ok", false)
        result.put("message", "Domain tidak diizinkan untuk manifest")
        return result
      }

      connection = (url.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = true
        connectTimeout = 10000
        readTimeout = 10000
        requestMethod = "GET"
        setRequestProperty("User-Agent", "DigiSwiss-Round-Android")
      }
      connection.connect()

      val code = connection.responseCode
      if (code != HttpURLConnection.HTTP_OK) {
        result.put("ok", false)
        result.put("message", "HTTP status manifest: $code")
        return result
      }

      val inputStream = connection.inputStream
      val buffer = ByteArray(4096)
      val out = java.io.ByteArrayOutputStream()
      var totalRead = 0
      var bytesRead: Int

      while (inputStream.read(buffer).also { bytesRead = it } != -1) {
        totalRead += bytesRead
        if (totalRead > 65536) { // Batas maksimal 64 KB
          result.put("ok", false)
          result.put("message", "Ukuran manifest melebihi batas 64 KB")
          return result
        }
        out.write(buffer, 0, bytesRead)
      }

      val rawJson = out.toString("UTF-8")
      val manifestJson = JSONObject(rawJson)

      // Validasi versi dari manifest
      val manifestVer = manifestJson.optString("version").trim().removePrefix("v").removePrefix("V")
      if (!VERSION_REGEX.matches(manifestVer)) {
        result.put("ok", false)
        result.put("message", "Format versi pada manifest tidak valid: ${manifestJson.optString("version")}")
        return result
      }

      result.put("ok", true)
      result.put("manifest", manifestJson)
      return result
    } catch (e: Exception) {
      result.put("ok", false)
      result.put("message", e.message ?: "Gagal mengunduh manifest OTA")
      return result
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * Mengunduh bundle zip, memverifikasi SHA-256, mengekstrak dengan proteksi zip-slip,
   * dan mencatat ke current.json.
   */
  fun downloadAndExtractBundle(
    context: Context,
    version: String,
    expectedSha256: String,
    onProgress: (progress: Int, received: Long, total: Long) -> Unit
  ): JSONObject {
    val result = JSONObject()
    val cleanVer = version.trim().removePrefix("v").removePrefix("V")
    if (!VERSION_REGEX.matches(cleanVer)) {
      result.put("ok", false)
      result.put("message", "Format versi OTA tidak valid, wajib format mayor.minor.patch")
      return result
    }

    val cleanSha = expectedSha256.trim()
    if (!SHA256_REGEX.matches(cleanSha)) {
      result.put("ok", false)
      result.put("message", "Format SHA-256 tidak valid, wajib 64 karakter heksadesimal")
      return result
    }

    val bundleUrl = "https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v$cleanVer/DigiSwiss-Round-web-v$cleanVer.zip"
    val tempZip = File(context.cacheDir, "ota_download_$cleanVer.zip")
    if (tempZip.exists()) tempZip.delete()

    var connection: HttpURLConnection? = null
    try {
      val url = URL(bundleUrl)
      val host = url.host.lowercase()
      if (host != "github.com" && !host.endsWith(".githubusercontent.com")) {
        result.put("ok", false)
        result.put("message", "Domain unduhan bundle OTA tidak diizinkan")
        return result
      }

      connection = (url.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = true
        connectTimeout = 15000
        readTimeout = 30000
        requestMethod = "GET"
        setRequestProperty("User-Agent", "DigiSwiss-Round-Android")
      }
      connection.connect()

      val code = connection.responseCode
      if (code != HttpURLConnection.HTTP_OK) {
        result.put("ok", false)
        result.put("message", "Gagal mengunduh bundle zip (HTTP $code)")
        return result
      }

      val contentLength = connection.contentLength.toLong()
      val inputStream = BufferedInputStream(connection.inputStream)
      val outputStream = FileOutputStream(tempZip)
      val digest = MessageDigest.getInstance("SHA-256")

      val buffer = ByteArray(8192)
      var totalReceived = 0L
      var bytesRead: Int
      var lastReportTime = 0L

      while (inputStream.read(buffer).also { bytesRead = it } != -1) {
        outputStream.write(buffer, 0, bytesRead)
        digest.update(buffer, 0, bytesRead)
        totalReceived += bytesRead

        val now = System.currentTimeMillis()
        if (now - lastReportTime > 150 || (contentLength > 0 && totalReceived == contentLength)) {
          lastReportTime = now
          val progress = if (contentLength > 0) {
            ((totalReceived * 100) / contentLength).toInt().coerceIn(0, 100)
          } else {
            -1
          }
          onProgress(progress, totalReceived, contentLength)
        }
      }

      outputStream.flush()
      outputStream.close()
      inputStream.close()

      // 1. Verifikasi SHA-256 (Wajib cocok persis)
      val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
      if (!actualSha.equals(cleanSha, ignoreCase = true)) {
        tempZip.delete()
        result.put("ok", false)
        result.put("message", "Verifikasi SHA-256 gagal! Diharapkan: $cleanSha, didapat: $actualSha")
        return result
      }

      // 2. Ekstrak zip ke filesDir/ota/web-{versi}/
      val targetDir = File(getOtaDir(context), "web-$cleanVer")
      if (targetDir.exists()) {
        targetDir.deleteRecursively()
      }
      targetDir.mkdirs()

      val zis = ZipInputStream(BufferedInputStream(FileInputStream(tempZip)))
      var entry: ZipEntry? = zis.nextEntry
      var totalExtractedBytes = 0L
      var totalEntriesCount = 0
      val canonicalDestDir = targetDir.canonicalPath

      while (entry != null) {
        totalEntriesCount++
        if (totalEntriesCount > MAX_EXTRACT_ENTRIES) {
          zis.close()
          targetDir.deleteRecursively()
          tempZip.delete()
          result.put("ok", false)
          result.put("message", "Jumlah berkas dalam zip melebihi batas $MAX_EXTRACT_ENTRIES")
          return result
        }

        // Perlindungan Zip Slip: tolak path traversal atau path absolut
        val entryName = entry.name
        if (entryName.contains("..") || entryName.startsWith("/") || entryName.startsWith("\\")) {
          zis.close()
          targetDir.deleteRecursively()
          tempZip.delete()
          result.put("ok", false)
          result.put("message", "Zip Slip traversal terdeteksi pada berkas: $entryName")
          return result
        }

        val destFile = File(targetDir, entryName)
        val canonicalDestFile = destFile.canonicalPath
        if (!canonicalDestFile.startsWith(canonicalDestDir + File.separator) && canonicalDestFile != canonicalDestDir) {
          zis.close()
          targetDir.deleteRecursively()
          tempZip.delete()
          result.put("ok", false)
          result.put("message", "Zip Slip traversal terdeteksi: $entryName")
          return result
        }

        if (entry.isDirectory) {
          destFile.mkdirs()
        } else {
          destFile.parentFile?.mkdirs()
          val fos = FileOutputStream(destFile)
          val entryBuf = ByteArray(4096)
          var entryRead: Int
          while (zis.read(entryBuf).also { entryRead = it } != -1) {
            totalExtractedBytes += entryRead
            if (totalExtractedBytes > MAX_EXTRACT_BYTES) {
              fos.close()
              zis.close()
              targetDir.deleteRecursively()
              tempZip.delete()
              result.put("ok", false)
              result.put("message", "Ukuran ekstraksi melebihi batas 50 MB")
              return result
            }
            fos.write(entryBuf, 0, entryRead)
          }
          fos.flush()
          fos.close()
        }

        zis.closeEntry()
        entry = zis.nextEntry
      }
      zis.close()

      // 3. Pastikan index.html ada
      val indexHtml = File(targetDir, "index.html")
      if (!indexHtml.exists()) {
        targetDir.deleteRecursively()
        tempZip.delete()
        result.put("ok", false)
        result.put("message", "index.html tidak ditemukan dalam paket OTA")
        return result
      }

      // 4. Tulis current.json {version, dir}
      val currentJson = JSONObject().apply {
        put("version", cleanVer)
        put("dir", "web-$cleanVer")
      }
      getCurrentJsonFile(context).writeText(currentJson.toString())

      // 5. Bersihkan direktori OTA lama (simpan maksimal 1 folder sebelumnya untuk rollback)
      cleanupOldOtaVersions(context, currentDirName = "web-$cleanVer")

      // Hapus zip sementara
      tempZip.delete()

      result.put("ok", true)
      result.put("version", cleanVer)
      result.put("dir", "web-$cleanVer")
      result.put("message", "Paket OTA web-$cleanVer berhasil dipasang")
      return result
    } catch (e: Exception) {
      tempZip.delete()
      result.put("ok", false)
      result.put("message", e.message ?: "Terjadi kesalahan saat memproses paket OTA")
      return result
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * Menghapus versi OTA yang lebih lama, hanya menyisakan versi aktif saat ini
   * dan maksimal 1 folder versi sebelumnya.
   */
  private fun cleanupOldOtaVersions(context: Context, currentDirName: String) {
    try {
      val otaRoot = getOtaDir(context)
      val dirs = otaRoot.listFiles { file -> file.isDirectory && file.name.startsWith("web-") } ?: return
      if (dirs.size <= 2) return

      // Urutkan berdasarkan waktu modifikasi terbaru
      val sorted = dirs.sortedByDescending { it.lastModified() }
      for (i in 2 until sorted.size) {
        val oldDir = sorted[i]
        if (oldDir.name != currentDirName) {
          Log.i(TAG, "Menghapus versi OTA lama: ${oldDir.name}")
          oldDir.deleteRecursively()
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "Gagal membersihkan versi OTA lama", e)
    }
  }

  fun getCurrentOtaInfo(context: Context): JSONObject {
    val result = JSONObject()
    val pInfo = try {
      context.packageManager.getPackageInfo(context.packageName, 0)
    } catch (_: Exception) {
      null
    }
    val nativeVersion = pInfo?.versionName ?: "1.0"
    result.put("nativeVersion", nativeVersion)

    val currentFile = getCurrentJsonFile(context)
    if (currentFile.exists()) {
      try {
        val json = JSONObject(currentFile.readText())
        result.put("isOta", true)
        result.put("otaVersion", json.optString("version"))
        result.put("dir", json.optString("dir"))
      } catch (_: Exception) {
        result.put("isOta", false)
      }
    } else {
      result.put("isOta", false)
    }
    return result
  }
}
