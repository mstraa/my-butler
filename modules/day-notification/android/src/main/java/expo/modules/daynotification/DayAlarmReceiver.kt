package expo.modules.daynotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Réveil du matin (publie « Ma journée ») ; après un redémarrage ou une mise à jour, remet tout en place. */
class DayAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      DayNotifier.ACTION_MORNING -> DayNotifier.fireScheduled(context)
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> DayNotifier.restore(context)
    }
  }
}
