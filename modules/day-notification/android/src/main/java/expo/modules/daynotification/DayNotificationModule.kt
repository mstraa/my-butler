package expo.modules.daynotification

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Notification « Ma journée » avec la mise en page de la maquette (RemoteViews), que les notifications
 * standard ne permettent pas. Le contenu arrive déjà calculé depuis le JS, en JSON (voir DayNotifier).
 */
class DayNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DayNotification")

    /** Affiche (ou remplace) la notification tout de suite. */
    Function("show") { json: String -> DayNotifier.post(context, json) }

    /** Garde le contenu du prochain matin et le publie à l'heure dite (alarme exacte si permise). */
    Function("schedule") { json: String, atMs: Double -> DayNotifier.schedule(context, json, atMs.toLong()) }

    /** Retire la notification et l'alarme du matin. */
    Function("cancel") { DayNotifier.cancel(context) }
  }
}
