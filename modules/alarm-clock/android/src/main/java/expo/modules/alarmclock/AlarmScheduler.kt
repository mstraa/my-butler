package expo.modules.alarmclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** Une alarme : { id, at (ms), title, body, link, health? } (voir AlarmClock.types.ts). */
data class AlarmSpec(
  val id: String,
  val at: Long,
  val title: String,
  val body: String,
  val link: String,
  /** { metric: 'steps', goal } | { metric: 'sleep' } : vérifié dans Health Connect avant de sonner. */
  val health: JSONObject?,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("at", at).put("title", title).put("body", body).put("link", link)
    .apply { if (health != null) put("health", health) }

  companion object {
    fun fromJson(o: JSONObject) = AlarmSpec(
      id = o.getString("id"),
      at = o.getLong("at"),
      title = o.optString("title"),
      body = o.optString("body"),
      link = o.optString("link"),
      health = o.optJSONObject("health"),
    )
  }
}

/**
 * Tient la liste des alarmes et leurs réveils système (AlarmManager.setAlarmClock : exacts, même en veille,
 * avec l'icône de réveil dans la barre d'état). Le JS remplace la liste « prévue » à chaque synchronisation ;
 * les « répéter dans 10 min » sont gardés à part pour ne pas être effacés par elle.
 */
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.alarmclock.FIRE"
  const val EXTRA_ID = "id"
  const val SNOOZE_MS = 10 * 60_000L
  private const val PREFS = "alarm_clock"

  fun setAlarms(context: Context, json: String) {
    for (old in list(context, "planned")) cancel(context, old.id)
    val next = parse(json)
    prefs(context).edit().putString("planned", json).apply()
    for (a in next) set(context, a)
  }

  /** L'alarme qui sonne maintenant (prévue ou répétée) ; un « répéter » est consommé. */
  fun take(context: Context, id: String): AlarmSpec? {
    val snoozed = list(context, "snoozed")
    snoozed.firstOrNull { it.id == id }?.let { s ->
      save(context, "snoozed", snoozed.filter { it.id != id })
      return s
    }
    return list(context, "planned").firstOrNull { it.id == id }
  }

  /** Resonne dans 10 min, sans nouvelle vérification Health Connect. */
  fun snooze(context: Context, a: AlarmSpec) =
    once(context, a.copy(id = "snooze-${a.id.removePrefix("snooze-")}", at = System.currentTimeMillis() + SNOOZE_MS, health = null))

  /** Alarme ponctuelle gardée hors de la liste du JS (répétition, alarme de test). */
  fun once(context: Context, s: AlarmSpec) {
    save(context, "snoozed", list(context, "snoozed").filter { it.id != s.id } + s)
    set(context, s)
  }

  /** Redémarrage ou mise à jour de l'app : les réveils système ont disparu, on les remet. */
  fun restore(context: Context) {
    val now = System.currentTimeMillis()
    save(context, "snoozed", list(context, "snoozed").filter { it.at > now })
    for (a in list(context, "planned") + list(context, "snoozed")) set(context, a)
  }

  private fun set(context: Context, a: AlarmSpec) {
    if (a.at <= System.currentTimeMillis()) return
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val fire = fireIntent(context, a.id)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    try {
      if (exact) alarms.setAlarmClock(AlarmManager.AlarmClockInfo(a.at, openApp(context)), fire)
      else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, fire)
    } catch (e: SecurityException) {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, fire)
    }
  }

  private fun cancel(context: Context, id: String) {
    context.getSystemService(AlarmManager::class.java)?.cancel(fireIntent(context, id))
  }

  /** L'id va dans l'URI : deux alarmes donnent deux PendingIntent distincts. */
  private fun fireIntent(context: Context, id: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.parse("alarm://fire/${Uri.encode(id)}"))
      .putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Toucher l'icône de réveil de la barre d'état : ouvre l'app. */
  private fun openApp(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().setPackage(context.packageName)
    return PendingIntent.getActivity(context, 7400, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun list(context: Context, key: String) = parse(prefs(context).getString(key, null) ?: "[]")

  private fun save(context: Context, key: String, items: List<AlarmSpec>) {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    prefs(context).edit().putString(key, arr.toString()).apply()
  }

  private fun parse(json: String): List<AlarmSpec> = try {
    val arr = JSONArray(json)
    (0 until arr.length()).map { AlarmSpec.fromJson(arr.getJSONObject(it)) }
  } catch (e: Exception) {
    emptyList()
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
