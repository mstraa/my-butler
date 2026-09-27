package expo.modules.alarmclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Heure d'une alarme : lance la sonnerie ; après un redémarrage ou une mise à jour, remet les réveils. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
        AlarmService.ring(context, id)
      }
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> AlarmScheduler.restore(context)
    }
  }
}
