package expo.modules.alarmclock

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Vraies alarmes (sonnerie en boucle, écran plein sur l'écran verrouillé) pour les rendez-vous, objectifs
 * et suivis. Le JS calcule la liste et la passe en JSON (voir AlarmScheduler).
 */
class AlarmClockModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AlarmClock")

    Function("setAlarms") { json: String -> AlarmScheduler.setAlarms(context, json) }

    /** Développement : une alarme dans `seconds` secondes. */
    Function("test") { seconds: Int, title: String, body: String ->
      AlarmScheduler.once(context, AlarmSpec("test", System.currentTimeMillis() + seconds * 1000L, title, body, "", null))
    }

    Function("canUseFullScreen") {
      if (Build.VERSION.SDK_INT < 34) true
      else context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false
    }

    Function("openFullScreenSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
