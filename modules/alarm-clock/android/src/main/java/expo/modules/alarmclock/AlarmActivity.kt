package expo.modules.alarmclock

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Écran plein de l'alarme, par-dessus l'écran verrouillé : heure, titre, « Répéter », « Arrêter », « Ouvrir ». */
class AlarmActivity : Activity() {
  private val done = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(R.layout.alarm_activity)

    val filter = IntentFilter(AlarmService.ACTION_DONE)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(done, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(done, filter)
    }

    findViewById<TextView>(R.id.alarm_stop).setOnClickListener {
      AlarmService.command(this, AlarmService.ACTION_STOP)
      finish()
    }
    findViewById<TextView>(R.id.alarm_snooze).setOnClickListener {
      AlarmService.command(this, AlarmService.ACTION_SNOOZE)
      finish()
    }
    findViewById<TextView>(R.id.alarm_open).setOnClickListener { open() }
  }

  override fun onResume() {
    super.onResume()
    val spec = AlarmService.current ?: return finish()
    findViewById<TextView>(R.id.alarm_clock).text = SimpleDateFormat("HH:mm", Locale.FRANCE).format(Date())
    findViewById<TextView>(R.id.alarm_title).text = spec.title
    findViewById<TextView>(R.id.alarm_body).text = spec.body
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  override fun onDestroy() {
    runCatching { unregisterReceiver(done) }
    super.onDestroy()
  }

  /** Arrête la sonnerie et ouvre l'écran lié dans l'app (après déverrouillage si besoin). */
  private fun open() {
    val link = AlarmService.current?.link
    val go = {
      AlarmService.command(this, AlarmService.ACTION_STOP)
      if (!link.isNullOrEmpty()) {
        runCatching {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
      }
      finish()
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (keyguard == null || !keyguard.isKeyguardLocked) return go()
    keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
      override fun onDismissSucceeded() = go()
    })
  }
}
