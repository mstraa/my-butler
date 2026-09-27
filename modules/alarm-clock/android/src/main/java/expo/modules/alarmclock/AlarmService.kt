package expo.modules.alarmclock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Service au premier plan qui fait sonner l'alarme : sonnerie d'alarme du téléphone en boucle (flux alarme :
 * elle sonne même en mode silencieux), vibration, et notification plein écran qui ouvre AlarmActivity
 * (sur l'écran verrouillé) ou s'affiche en bandeau (téléphone en main). S'arrête seule au bout de 5 min.
 */
class AlarmService : Service() {
  companion object {
    private const val ACTION_RING = "expo.modules.alarmclock.RING"
    const val ACTION_STOP = "expo.modules.alarmclock.STOP"
    const val ACTION_SNOOZE = "expo.modules.alarmclock.SNOOZE"
    /** Diffusé quand la sonnerie s'arrête : l'écran plein se ferme. */
    const val ACTION_DONE = "expo.modules.alarmclock.DONE"

    const val CHANNEL = "alarmes"
    private const val CHECK_CHANNEL = "alarmes_verif"
    private const val NOTIF_ID = 7401
    private const val CHECK_ID = 7402
    private const val TIMEOUT_MS = 5 * 60_000L

    /** Alarme qui sonne en ce moment (lue par AlarmActivity). */
    @Volatile var current: AlarmSpec? = null
      private set

    fun ring(context: Context, id: String) {
      val intent = Intent(context, AlarmService::class.java).setAction(ACTION_RING).putExtra(AlarmScheduler.EXTRA_ID, id)
      context.startForegroundService(intent)
    }

    fun command(context: Context, action: String) {
      context.startService(Intent(context, AlarmService::class.java).setAction(action))
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val timeout = Runnable { missed() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_RING -> {
        val spec = intent.getStringExtra(AlarmScheduler.EXTRA_ID)?.let { AlarmScheduler.take(this, it) }
        when {
          spec == null -> {
            // Alarme retirée entre-temps : startForegroundService oblige quand même à passer au premier plan.
            foreground(CHECK_ID, checkNotification())
            idleOrBack()
          }
          spec.health != null -> check(spec)
          else -> start(spec)
        }
      }
      ACTION_SNOOZE -> {
        current?.let { AlarmScheduler.snooze(this, it) }
        finish()
      }
      ACTION_STOP -> finish()
      else -> if (current == null) finish()
    }
    return START_NOT_STICKY
  }

  /** Suivi relié à Health Connect : on relit les données avant de sonner (discrètement, en arrière-plan). */
  private fun check(spec: AlarmSpec) {
    foreground(CHECK_ID, checkNotification())
    Thread {
      val done = HealthCheck.isDone(this, spec.health!!)
      handler.post { if (done) idleOrBack() else start(spec) }
    }.start()
  }

  /** Rien à faire sonner : on s'arrête, ou on revient à l'alarme qui sonne déjà. */
  private fun idleOrBack() {
    val ringing = current
    if (ringing == null) return finish()
    foreground(NOTIF_ID, alarmNotification(ringing))
    manager()?.cancel(CHECK_ID)
  }

  private fun start(spec: AlarmSpec) {
    current = spec
    foreground(NOTIF_ID, alarmNotification(spec))
    manager()?.cancel(CHECK_ID)
    if (player == null) playSound()
    if (vibrator == null) vibrate()
    if (wakeLock == null) {
      wakeLock = getSystemService(PowerManager::class.java)
        ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mypersonallife:alarm")
        ?.apply { acquire(TIMEOUT_MS + 10_000) }
    }
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, TIMEOUT_MS)
  }

  /** Personne n'a répondu : on se tait et on laisse une notification simple. */
  private fun missed() {
    val spec = current
    if (spec != null) {
      val n = Notification.Builder(this, CHANNEL)
        .setSmallIcon(smallIcon())
        .setColor(Color.parseColor("#F4F4F2"))
        .setContentTitle(spec.title)
        .setContentText("Alarme manquée · ${spec.body}")
        .setAutoCancel(true)
        .setCategory(Notification.CATEGORY_REMINDER)
        .setContentIntent(openLink(spec))
        .build()
      manager()?.notify("alarme-manquee", spec.id.hashCode(), n)
    }
    finish()
  }

  private fun finish() {
    handler.removeCallbacks(timeout)
    player?.runCatching { stop(); release() }
    player = null
    vibrator?.cancel()
    vibrator = null
    wakeLock?.runCatching { if (isHeld) release() }
    wakeLock = null
    current = null
    sendBroadcast(Intent(ACTION_DONE).setPackage(packageName))
    stopForeground(STOP_FOREGROUND_REMOVE)
    manager()?.cancel(CHECK_ID)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    player?.runCatching { release() }
    vibrator?.cancel()
    wakeLock?.runCatching { if (isHeld) release() }
    current = null
    super.onDestroy()
  }

  private fun playSound() {
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val uris = listOfNotNull(
      RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
    )
    for (uri in uris) {
      try {
        player = MediaPlayer().apply {
          setAudioAttributes(attrs)
          setDataSource(this@AlarmService, uri)
          isLooping = true
          prepare()
          start()
        }
        return
      } catch (e: Exception) {
        player?.release()
        player = null
      }
    }
  }

  private fun vibrate() {
    val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
    }
    if (v == null || !v.hasVibrator()) return
    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 800, 700), 0), attrs)
    vibrator = v
  }

  private fun foreground(id: Int, n: Notification) {
    ensureChannels()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(id, n)
  }

  private fun alarmNotification(spec: AlarmSpec): Notification {
    val screen = PendingIntent.getActivity(
      this, NOTIF_ID,
      Intent(this, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return Notification.Builder(this, CHANNEL)
      .setSmallIcon(smallIcon())
      .setColor(Color.parseColor("#F4F4F2"))
      .setContentTitle(spec.title)
      .setContentText(spec.body)
      .setSubText("Alarme")
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setWhen(spec.at)
      .setShowWhen(true)
      .setFullScreenIntent(screen, true)
      .setContentIntent(screen)
      .addAction(Notification.Action.Builder(null as Icon?, "Répéter 10 min", serviceIntent(ACTION_SNOOZE)).build())
      .addAction(Notification.Action.Builder(null as Icon?, "Arrêter", serviceIntent(ACTION_STOP)).build())
      .build()
  }

  private fun checkNotification(): Notification =
    Notification.Builder(this, CHECK_CHANNEL)
      .setSmallIcon(smallIcon())
      .setColor(Color.parseColor("#F4F4F2"))
      .setContentTitle("Alarme")
      .setContentText("Lecture de Health Connect…")
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()

  private fun serviceIntent(action: String) = PendingIntent.getService(
    this, action.hashCode(), Intent(this, AlarmService::class.java).setAction(action),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  private fun openLink(spec: AlarmSpec): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(spec.link)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(this, spec.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Canal de l'alarme : muet (la sonnerie vient du service), mais prioritaire pour l'écran plein. */
  private fun ensureChannels() {
    val m = manager() ?: return
    if (m.getNotificationChannel(CHANNEL) == null) {
      m.createNotificationChannel(
        NotificationChannel(CHANNEL, "Alarmes", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Alarmes des rendez-vous, objectifs et suivis : sonnerie et écran plein."
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (m.getNotificationChannel(CHECK_CHANNEL) == null) {
      m.createNotificationChannel(
        NotificationChannel(CHECK_CHANNEL, "Vérification des alarmes", NotificationManager.IMPORTANCE_MIN).apply {
          description = "Brève lecture de Health Connect avant une alarme de suivi."
          setSound(null, null)
        },
      )
    }
  }

  private fun manager() = getSystemService(NotificationManager::class.java)

  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }
}
