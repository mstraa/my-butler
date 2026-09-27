package expo.modules.daynotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Heure d'une mise à jour de « Ma journée » (matin, fin d'un rdv…) ; après un redémarrage ou une mise à jour, remet tout en place. */
class DayAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      DayNotifier.ACTION_UPDATE -> DayNotifier.advance(context)
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> DayNotifier.restore(context)
    }
  }
}
