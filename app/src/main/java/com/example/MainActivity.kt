package com.example

import android.Manifest
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
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : ComponentActivity() {
  private var nativeBridge: NativeBridge? = null
  private var webViewRef: WebView? = null
  private var webViewKey by mutableIntStateOf(0)
  private val backHandler = Handler(Looper.getMainLooper())
  private var pendingBackTimeout: Runnable? = null
  private var pendingResumeCheck: Runnable? = null
  private var pendingResumeRetry: Runnable? = null
  private var resumeCheckGeneration: Int = 0
  private lateinit var pickQrImageLauncher: ActivityResultLauncher<PickVisualMediaRequest>
  private lateinit var requestNotificationPermissionLauncher: ActivityResultLauncher<String>

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
    PushRuntimeState.ensureNotificationChannel(this)

    pickQrImageLauncher = registerForActivityResult(
      ActivityResultContracts.PickVisualMedia()
    ) { uri ->
      nativeBridge?.onQrImagePicked(uri)
    }

    requestNotificationPermissionLauncher = registerForActivityResult(
      ActivityResultContracts.RequestPermission()
    ) { granted ->
      nativeBridge?.onNotificationPermissionResult(granted)
    }

    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(downloadReceiver, filter)
    }

    handleNotificationIntent(intent)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        handleAndroidBackPressed()
      }
    })

    setContent {
      Surface(
        modifier = Modifier.fillMaxSize(),
        color = androidx.compose.ui.graphics.Color(0xFF0B0F14)
      ) {
        DigiSwissWebView(
          webViewKey = webViewKey,
          onWebViewCreated = { webView ->
            webViewRef = webView
          },
          onBridgeCreated = { bridge ->
            nativeBridge = bridge
            PushRuntimeState.attachBridge(bridge)
          },
          onRenderProcessGone = { didCrash, deadWebView ->
            RendererDiagnostics.recordRendererGone(this, didCrash)
            cancelPendingResumeChecks()
            if (webViewRef === deadWebView) {
              webViewRef = null
            }
            PushRuntimeState.detachBridge(nativeBridge)
            nativeBridge = null
            try {
              (deadWebView.parent as? ViewGroup)?.removeView(deadWebView)
              deadWebView.stopLoading()
              deadWebView.destroy()
            } catch (_: Exception) {}
            webViewKey += 1
          },
          onPickQrImage = {
            pickQrImageLauncher.launch(
              PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
            )
          },
          onRequestNotificationPermission = {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
          }
        )
      }
    }
  }

  private fun handleAndroidBackPressed() {
    val webView = webViewRef
    if (webView == null) {
      finish()
      return
    }

    pendingBackTimeout?.let { backHandler.removeCallbacks(it) }
    val settled = AtomicBoolean(false)
    val timeoutRunnable = Runnable {
      if (settled.compareAndSet(false, true)) {
        pendingBackTimeout = null
        finish()
      }
    }
    pendingBackTimeout = timeoutRunnable
    backHandler.postDelayed(timeoutRunnable, 400L)

    try {
      webView.evaluateJavascript(
        "(function(){try{return window.__digiswissHandleBack ? !!window.__digiswissHandleBack() : false;}catch(e){return false;}})()"
      ) { rawResult ->
        if (!settled.compareAndSet(false, true)) return@evaluateJavascript
        backHandler.removeCallbacks(timeoutRunnable)
        if (pendingBackTimeout === timeoutRunnable) {
          pendingBackTimeout = null
        }
        val handled = rawResult?.trim() == "true"
        if (!handled) {
          finish()
        }
      }
    } catch (_: Exception) {
      if (settled.compareAndSet(false, true)) {
        backHandler.removeCallbacks(timeoutRunnable)
        pendingBackTimeout = null
        finish()
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleNotificationIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    PushRuntimeState.isAppInForeground = true
    val currentWebView = webViewRef ?: return
    currentWebView.onResume()
    scheduleResumeRootCheck(currentWebView)
  }

  override fun onPause() {
    PushRuntimeState.isAppInForeground = false
    cancelPendingResumeChecks()
    super.onPause()
  }

  private fun cancelPendingResumeChecks() {
    resumeCheckGeneration += 1
    pendingResumeCheck?.let { backHandler.removeCallbacks(it) }
    pendingResumeCheck = null
    pendingResumeRetry?.let { backHandler.removeCallbacks(it) }
    pendingResumeRetry = null
  }

  private fun evaluateRootHasChildren(target: WebView, onResult: (Boolean) -> Unit) {
    try {
      target.evaluateJavascript(
        "(function(){try{var r=document.getElementById('root');return !!(r&&r.children&&r.children.length>0);}catch(e){return false;}})()"
      ) { rawResult ->
        onResult(rawResult?.trim() == "true")
      }
    } catch (_: Exception) {
      onResult(false)
    }
  }

  private fun reloadWebViewPage(target: WebView) {
    val currentUrl = target.url?.takeIf { it.isNotBlank() }
    if (currentUrl != null) {
      target.loadUrl(currentUrl)
    } else {
      target.loadUrl(OtaManager.resolveInitialUrl(this))
    }
  }

  private fun scheduleResumeRootCheck(target: WebView) {
    cancelPendingResumeChecks()
    val gen = resumeCheckGeneration
    val firstCheck = Runnable {
      pendingResumeCheck = null
      if (gen != resumeCheckGeneration || isFinishing || isDestroyed) return@Runnable
      val active = webViewRef
      if (active == null || active !== target) return@Runnable

      evaluateRootHasChildren(active) { firstOk ->
        if (gen != resumeCheckGeneration || isFinishing || isDestroyed) return@evaluateRootHasChildren
        if (firstOk) return@evaluateRootHasChildren

        val retryCheck = Runnable {
          pendingResumeRetry = null
          if (gen != resumeCheckGeneration || isFinishing || isDestroyed) return@Runnable
          val current = webViewRef
          if (current == null || current !== target) return@Runnable

          evaluateRootHasChildren(current) { secondOk ->
            if (gen != resumeCheckGeneration || isFinishing || isDestroyed) return@evaluateRootHasChildren
            if (!secondOk) {
              reloadWebViewPage(current)
            }
          }
        }
        pendingResumeRetry = retryCheck
        backHandler.postDelayed(retryCheck, 1000L)
      }
    }
    pendingResumeCheck = firstCheck
    backHandler.postDelayed(firstCheck, 400L)
  }

  override fun onDestroy() {
    cancelPendingResumeChecks()
    pendingBackTimeout?.let { backHandler.removeCallbacks(it) }
    pendingBackTimeout = null
    webViewRef = null
    PushRuntimeState.isAppInForeground = false
    PushRuntimeState.detachBridge(nativeBridge)
    super.onDestroy()
    try {
      unregisterReceiver(downloadReceiver)
    } catch (_: Exception) {}
  }

  private fun handleNotificationIntent(targetIntent: Intent?) {
    if (targetIntent == null) return
    val tournamentId = targetIntent.getStringExtra(PushRuntimeState.EXTRA_TOURNAMENT_ID)?.trim().orEmpty()
    if (tournamentId.isEmpty()) return

    val pushType = targetIntent.getStringExtra(PushRuntimeState.EXTRA_PUSH_TYPE)?.trim().orEmpty()
    val matchId = targetIntent.getStringExtra(PushRuntimeState.EXTRA_MATCH_ID)?.trim().orEmpty()

    targetIntent.removeExtra(PushRuntimeState.EXTRA_TOURNAMENT_ID)
    targetIntent.removeExtra(PushRuntimeState.EXTRA_PUSH_TYPE)
    targetIntent.removeExtra(PushRuntimeState.EXTRA_MATCH_ID)

    val detail = JSONObject().apply {
      put("type", "notification-opened")
      put("tournamentId", tournamentId)
      if (pushType.isNotEmpty()) put("pushType", pushType)
      if (matchId.isNotEmpty()) put("matchId", matchId)
    }
    PushRuntimeState.enqueueOrDispatchOpenedNotification(detail)
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DigiSwissWebView(
  modifier: Modifier = Modifier,
  webViewKey: Int = 0,
  onWebViewCreated: (WebView) -> Unit = {},
  onBridgeCreated: (NativeBridge) -> Unit = {},
  onRenderProcessGone: (didCrash: Boolean, webView: WebView) -> Unit = { _, _ -> },
  onPickQrImage: () -> Unit = {},
  onRequestNotificationPermission: () -> Unit = {}
) {
  key(webViewKey) {
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

          onWebViewCreated(this)

          val bridge = NativeBridge(
            activity = activity,
            webView = this,
            onPickQrImage = onPickQrImage,
            onRequestNotificationPermission = onRequestNotificationPermission
          )
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

            override fun onRenderProcessGone(
              view: WebView?,
              detail: RenderProcessGoneDetail?
            ): Boolean {
              val targetView = view ?: this@apply
              val didCrash = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                detail?.didCrash() == true
              } else {
                false
              }
              onRenderProcessGone(didCrash, targetView)
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
}
