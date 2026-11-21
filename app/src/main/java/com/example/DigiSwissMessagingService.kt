package com.example

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicInteger

object PushRuntimeState {
  const val PREFS_NAME = "digiswiss_push_prefs"
  const val KEY_FCM_TOKEN = "fcm_token"
  const val KEY_ASKED_PERMISSION = "asked_notif_permission"
  const val CHANNEL_ID = "digiswiss_default"
  const val EXTRA_TOURNAMENT_ID = "push_tournament_id"
  const val EXTRA_PUSH_TYPE = "push_type"
  const val EXTRA_MATCH_ID = "push_match_id"

  @Volatile
  var isAppInForeground: Boolean = false

  @Volatile
  var isWebPushReady: Boolean = false

  @Volatile
  private var bridgeRef: WeakReference<NativeBridge>? = null

  @Volatile
  private var pendingOpenedNotification: JSONObject? = null

  private val notificationIdSeq = AtomicInteger(1000)

  fun nextNotificationId(): Int = notificationIdSeq.incrementAndGet() and 0x7FFFFFFF

  fun attachBridge(bridge: NativeBridge?) {
    bridgeRef = if (bridge != null) WeakReference(bridge) else null
    isWebPushReady = false
  }

  fun detachBridge(bridge: NativeBridge?) {
    val current = bridgeRef?.get()
    if (current == null || current === bridge) {
      bridgeRef = null
      isWebPushReady = false
    }
  }

  fun getActiveBridge(): NativeBridge? = bridgeRef?.get()

  fun markWebReadyAndFlush() {
    isWebPushReady = true
    val bridge = getActiveBridge() ?: return
    val pending = synchronized(this) {
      val item = pendingOpenedNotification
      pendingOpenedNotification = null
      item
    }
    if (pending != null) {
      bridge.dispatchNativeEvent("notification-opened", pending)
    }
  }

  fun enqueueOrDispatchOpenedNotification(payload: JSONObject) {
    val bridge = getActiveBridge()
    if (bridge != null && isWebPushReady) {
      bridge.dispatchNativeEvent("notification-opened", payload)
    } else {
      synchronized(this) {
        pendingOpenedNotification = payload
      }
    }
  }

  fun saveFcmToken(context: Context, token: String) {
    if (token.isBlank()) return
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_FCM_TOKEN, token)
      .apply()
  }

  fun getSavedFcmToken(context: Context): String {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_FCM_TOKEN, "")
      .orEmpty()
  }

  fun markPermissionAsked(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ASKED_PERMISSION, true)
      .apply()
  }

  fun wasPermissionAsked(context: Context): Boolean {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(KEY_ASKED_PERMISSION, false)
  }

  fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Notifikasi DigiSwiss-Round",
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "Pemberitahuan pengumuman, ronde baru, konfirmasi skor, dan pendaftaran turnamen."
          enableVibration(true)
        }
        manager.createNotificationChannel(channel)
      }
    }
  }
}

class DigiSwissMessagingService : FirebaseMessagingService() {

  override fun onCreate() {
    super.onCreate()
    PushRuntimeState.ensureNotificationChannel(this)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    if (token.isBlank()) return
    PushRuntimeState.saveFcmToken(applicationContext, token)

    val bridge = PushRuntimeState.getActiveBridge()
    if (bridge != null && PushRuntimeState.isWebPushReady) {
      val detail = JSONObject().apply {
        put("type", "fcm-token-refreshed")
        put("token", token)
      }
      bridge.dispatchNativeEvent("fcm-token-refreshed", detail)
    }
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)
    val data = remoteMessage.data
    if (data.isEmpty()) return

    val title = data["title"]?.trim().orEmpty().ifEmpty { "DigiSwiss-Round" }
    val body = data["body"]?.trim().orEmpty()
    val pushType = data["type"]?.trim().orEmpty()
    val tournamentId = data["tournamentId"]?.trim().orEmpty()
    val matchId = data["matchId"]?.trim().orEmpty()

    if (body.isEmpty() && tournamentId.isEmpty()) return

    val activeBridge = PushRuntimeState.getActiveBridge()
    if (PushRuntimeState.isAppInForeground && activeBridge != null && PushRuntimeState.isWebPushReady) {
      // Aplikasi sedang terbuka di foreground: tampilkan sebagai in-app toast saja
      val detail = JSONObject().apply {
        put("type", "push-received")
        put("title", title)
        put("body", body)
        put("pushType", pushType)
        put("tournamentId", tournamentId)
        if (matchId.isNotEmpty()) put("matchId", matchId)
      }
      activeBridge.dispatchNativeEvent("push-received", detail)
      return
    }

    showSystemNotification(title, body, pushType, tournamentId, matchId)
  }

  private fun showSystemNotification(
    title: String,
    body: String,
    pushType: String,
    tournamentId: String,
    matchId: String
  ) {
    PushRuntimeState.ensureNotificationChannel(applicationContext)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        applicationContext,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }

    val openIntent = Intent(applicationContext, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(PushRuntimeState.EXTRA_TOURNAMENT_ID, tournamentId)
      putExtra(PushRuntimeState.EXTRA_PUSH_TYPE, pushType)
      if (matchId.isNotEmpty()) {
        putExtra(PushRuntimeState.EXTRA_MATCH_ID, matchId)
      }
    }

    val notifId = PushRuntimeState.nextNotificationId()
    val pendingIntent = PendingIntent.getActivity(
      applicationContext,
      notifId,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(applicationContext, PushRuntimeState.CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)

    try {
      NotificationManagerCompat.from(applicationContext).notify(notifId, builder.build())
    } catch (_: SecurityException) {
      // Abaikan jika izin notifikasi dicabut oleh sistem
    }
  }
}
