package com.example

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

class MainActivity : ComponentActivity() {
  private var nativeBridge: NativeBridge? = null

  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == DownloadManager.ACTION_DOWNLOAD_COMPLETE) {
        val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
        val bridge = nativeBridge ?: return
        if (id != -1L && id == bridge.lastDownloadId) {
          val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
          val query = DownloadManager.Query().setFilterById(id)
          val cursor = dm.query(query)
          if (cursor != null && cursor.moveToFirst()) {
            val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
            val status = if (statusIndex != -1) cursor.getInt(statusIndex) else -1
            val reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
            val reason = if (reasonIndex != -1) cursor.getInt(reasonIndex) else -1
            cursor.close()

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
              val detail = JSONObject().apply {
                put("type", "download-complete")
                put("fileName", bridge.lastDownloadedFileName)
                put("ok", true)
                put("message", "File berhasil diunduh")
              }
              bridge.dispatchNativeEvent("download-complete", detail)
            } else {
              val detail = JSONObject().apply {
                put("type", "download-failed")
                put("reason", "Status unduhan gagal: kode $reason")
              }
              bridge.dispatchNativeEvent("download-failed", detail)
            }
          } else {
            cursor?.close()
          }
        }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(downloadReceiver, filter)
    }

    setContent {
      Surface(
        modifier = Modifier.fillMaxSize(),
        color = androidx.compose.ui.graphics.Color(0xFF0B0F14)
      ) {
        DigiSwissWebView(
          onBridgeCreated = { bridge ->
            nativeBridge = bridge
          }
        )
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      unregisterReceiver(downloadReceiver)
    } catch (_: Exception) {}
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DigiSwissWebView(
  modifier: Modifier = Modifier,
  onBridgeCreated: (NativeBridge) -> Unit = {}
) {
  AndroidView(
    modifier = modifier.fillMaxSize(),
    factory = { context ->
      val activity = context as ComponentActivity
      WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        setBackgroundColor(Color.parseColor("#0B0F14"))
        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          databaseEnabled = true
          allowFileAccess = true
          allowContentAccess = true
          @Suppress("DEPRECATION")
          allowFileAccessFromFileURLs = true
          @Suppress("DEPRECATION")
          allowUniversalAccessFromFileURLs = true
          cacheMode = WebSettings.LOAD_DEFAULT
        }

        val bridge = NativeBridge(activity, this)
        addJavascriptInterface(bridge, "AndroidBridge")
        onBridgeCreated(bridge)

        val otaCanonicalDir = try {
          OtaManager.getOtaDir(activity).canonicalPath
        } catch (_: Exception) {
          ""
        }
        val otaPrefix = if (otaCanonicalDir.isNotEmpty()) "file://$otaCanonicalDir/" else ""

        webViewClient = object : WebViewClient() {
          override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url?.toString() ?: return false
            // Hanya izinkan awalan "file:///android_asset/" dan folder OTA aplikasi
            if (url.startsWith("file:///android_asset/") || (otaPrefix.isNotEmpty() && url.startsWith(otaPrefix))) {
              return false
            }
            if (url.startsWith("http://") || url.startsWith("https://")) {
              try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                  addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                return true
              } catch (_: Exception) {
                return false
              }
            }
            // URL file:// lain atau skema selain di atas tidak dimuat di WebView
            return true
          }
        }

        webChromeClient = object : WebChromeClient() {}

        setDownloadListener { url, _, contentDisposition, mimetype, _ ->
          if (url != null) {
            val guessedName = URLUtil.guessFileName(url, contentDisposition, mimetype)
            bridge.downloadApk(url, guessedName)
          }
        }

        val initialUrl = OtaManager.resolveInitialUrl(activity)
        loadUrl(initialUrl)
      }
    }
  )
}
