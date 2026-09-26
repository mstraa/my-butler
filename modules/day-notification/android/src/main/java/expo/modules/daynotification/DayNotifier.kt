package expo.modules.daynotification

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Construit et publie « Ma journée ». Contenu (JSON venu du JS) :
 * { day, title, titleAccent?, next, birthdays: [{ lead, text }], rdvLabel, rdv: [{ time, title, color, highlight }],
 *   more, lateLabel, late: [{ title, when, rdv }] }
 */
object DayNotifier {
  const val ACTION_MORNING = "expo.modules.daynotification.MORNING"
  private const val CHANNEL = "journee"
  private const val TAG = "ma-journee"
  private const val ID = 7301
  private const val PREFS = "day_notification"
  private const val MAX_RDV = 4
  private const val MAX_LATE = 3

  fun post(context: Context, json: String) {
    prefs(context).edit().putString("current", json).apply()
    val payload = JSONObject(json)
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!allowed(context, manager)) return
    ensureChannel(manager)
    manager.notify(TAG, ID, build(context, payload))
  }

  /** `json` vide : rien à montrer ce matin-là, l'alarme est retirée. */
  fun schedule(context: Context, json: String, atMs: Long) {
    if (json.isEmpty()) {
      prefs(context).edit().remove("next").remove("nextAt").apply()
      context.getSystemService(AlarmManager::class.java)?.cancel(morningIntent(context))
      return
    }
    prefs(context).edit().putString("next", json).putLong("nextAt", atMs).apply()
    setAlarm(context, atMs)
  }

  fun cancel(context: Context) {
    prefs(context).edit().clear().apply()
    context.getSystemService(AlarmManager::class.java)?.cancel(morningIntent(context))
    context.getSystemService(NotificationManager::class.java)?.cancel(TAG, ID)
  }

  /** L'alarme du matin : publie le contenu préparé la veille. */
  fun fireScheduled(context: Context) {
    val next = prefs(context).getString("next", null) ?: return
    prefs(context).edit().remove("next").remove("nextAt").apply()
    post(context, next)
  }

  /** Redémarrage : les alarmes et la notification ont disparu ; on les remet. */
  fun restore(context: Context) {
    val p = prefs(context)
    val next = p.getString("next", null)
    if (next != null) {
      val nextAt = p.getLong("nextAt", 0)
      if (nextAt <= System.currentTimeMillis()) return fireScheduled(context) // matin passé pendant l'arrêt
      setAlarm(context, nextAt)
    }
    val current = p.getString("current", null) ?: return
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date())
    if (JSONObject(current).optString("day") == today) post(context, current)
  }

  private fun build(context: Context, p: JSONObject): Notification {
    val pkg = context.packageName
    val collapsed = RemoteViews(pkg, R.layout.dn_collapsed).apply {
      val title = p.optString("title")
      val accent = p.optString("titleAccent")
      setTextViewText(R.id.dn_title, if (title.isNotEmpty() && accent.isNotEmpty()) "$title · " else title)
      setTextViewText(R.id.dn_title_accent, accent)
      setViewVisibility(R.id.dn_title_accent, visible(accent.isNotEmpty()))
      val next = p.optString("next")
      setTextViewText(R.id.dn_next, next)
      setViewVisibility(R.id.dn_next, if (next.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE)
    }
    val expanded = RemoteViews(pkg, R.layout.dn_expanded)

    val bdays = p.optJSONArray("birthdays")
    expanded.removeAllViews(R.id.dn_bdays)
    for (i in 0 until (bdays?.length() ?: 0)) {
      val b = bdays!!.getJSONObject(i)
      val row = RemoteViews(pkg, R.layout.dn_row_bday)
      row.setTextViewText(R.id.dn_text, bold("${b.getString("lead")} : ", b.getString("text")))
      expanded.addView(R.id.dn_bdays, row)
    }
    expanded.setViewVisibility(R.id.dn_bdays, visible((bdays?.length() ?: 0) > 0))

    val rdv = p.optJSONArray("rdv")
    val rdvCount = rdv?.length() ?: 0
    expanded.removeAllViews(R.id.dn_rdv)
    for (i in 0 until minOf(rdvCount, MAX_RDV)) {
      val r = rdv!!.getJSONObject(i)
      val row = RemoteViews(pkg, R.layout.dn_row_rdv)
      val color = parseColor(r.optString("color"))
      row.setInt(R.id.dn_dot, "setColorFilter", color)
      if (r.optBoolean("highlight")) {
        row.setTextViewText(R.id.dn_time, bold(r.getString("time"), ""))
        // Couleur résolue à l'affichage (thème clair / sombre du moment), pas à la publication.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) row.setColorStateList(R.id.dn_time, "setTextColor", R.color.dn_primary)
        else row.setTextColor(R.id.dn_time, context.getColor(R.color.dn_primary))
        row.setTextViewText(R.id.dn_title, bold(r.getString("title"), ""))
      } else {
        row.setTextViewText(R.id.dn_time, r.getString("time"))
        row.setTextViewText(R.id.dn_title, r.getString("title"))
      }
      expanded.addView(R.id.dn_rdv, row)
    }
    val more = rdvCount - MAX_RDV
    val label = p.optString("rdvLabel") + if (more > 0) "  +$more" else ""
    expanded.setTextViewText(R.id.dn_rdv_label, label)
    expanded.setViewVisibility(R.id.dn_rdv_label, visible(rdvCount > 0))
    expanded.setViewVisibility(R.id.dn_rdv, visible(rdvCount > 0))

    val late = p.optJSONArray("late")
    val lateCount = late?.length() ?: 0
    expanded.removeAllViews(R.id.dn_late)
    for (i in 0 until minOf(lateCount, MAX_LATE)) {
      val l = late!!.getJSONObject(i)
      val row = RemoteViews(pkg, R.layout.dn_row_late)
      row.setViewVisibility(R.id.dn_pill, visible(l.optBoolean("rdv")))
      row.setTextViewText(R.id.dn_title, l.getString("title"))
      row.setTextViewText(R.id.dn_when, l.optString("when"))
      expanded.addView(R.id.dn_late, row)
    }
    expanded.setTextViewText(R.id.dn_late_label, p.optString("lateLabel"))
    expanded.setViewVisibility(R.id.dn_late_box, visible(lateCount > 0))
    expanded.setViewVisibility(R.id.dn_empty, visible(rdvCount == 0 && lateCount == 0 && (bdays?.length() ?: 0) == 0))

    return Notification.Builder(context, CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setColor(Color.parseColor("#F4F4F2"))
      .setStyle(Notification.DecoratedCustomViewStyle())
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setSubText("Ma journée")
      .setContentTitle(p.optString("title"))
      .setContentText(p.optString("next"))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(openApp(context))
      .build()
  }

  private fun bold(strong: String, rest: String): CharSequence {
    val s = SpannableStringBuilder(strong)
    s.setSpan(StyleSpan(Typeface.BOLD), 0, strong.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    s.append(rest)
    return s
  }

  private fun visible(v: Boolean) = if (v) android.view.View.VISIBLE else android.view.View.GONE

  private fun parseColor(hex: String) =
    try { Color.parseColor(hex) } catch (e: IllegalArgumentException) { Color.GRAY }

  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun openApp(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().setPackage(context.packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, ID, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun morningIntent(context: Context): PendingIntent {
    val intent = Intent(context, DayAlarmReceiver::class.java).setAction(ACTION_MORNING)
    return PendingIntent.getBroadcast(context, ID, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun setAlarm(context: Context, atMs: Long) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pi = morningIntent(context)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
  }

  private fun allowed(context: Context, manager: NotificationManager): Boolean {
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
    return true
  }

  /** Le JS crée les canaux ; au cas où l'alarme passe avant (redémarrage), on crée celui-ci pareil. */
  private fun ensureChannel(manager: NotificationManager) {
    if (manager.getNotificationChannel(CHANNEL) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "Ma journée", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Résumé épinglé : rendez-vous du jour, anniversaires, retards."
      },
    )
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
