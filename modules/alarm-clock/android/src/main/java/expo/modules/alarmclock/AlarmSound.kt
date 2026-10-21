package expo.modules.alarmclock

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.Looper

/**
 * Sonnerie des alarmes, choisie dans les réglages de l'app parmi les sonneries d'alarme du téléphone.
 * Rien de choisi (ou sonnerie disparue) : celle du réveil du téléphone.
 */
object AlarmSound {
  private const val PREFS = "alarm_clock"
  private const val KEY = "sound"
  private const val PREVIEW_MS = 8_000L

  private val handler = Handler(Looper.getMainLooper())
  private var preview: MediaPlayer? = null
  private val stop = Runnable { stopPreview() }

  /** Flux alarme : sonne même en mode silencieux, au volume des alarmes. */
  val attributes: AudioAttributes
    get() = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

  /** Sonneries d'alarme du téléphone : [{ uri, title }]. */
  fun list(context: Context): List<Map<String, String>> = try {
    val manager = RingtoneManager(context).apply { setType(RingtoneManager.TYPE_ALARM) }
    val out = mutableListOf<Map<String, String>>()
    manager.cursor.use { c ->
      while (c.moveToNext()) {
        val uri = manager.getRingtoneUri(c.position) ?: continue
        out += mapOf("uri" to uri.toString(), "title" to (c.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: ""))
      }
    }
    out
  } catch (e: Exception) {
    emptyList()
  }

  /** La sonnerie choisie ({ uri, title }), ou null : celle du téléphone. */
  fun chosen(context: Context): Map<String, String>? {
    val uri = prefs(context).getString(KEY, null) ?: return null
    val title = runCatching { RingtoneManager.getRingtone(context, Uri.parse(uri))?.getTitle(context) }.getOrNull()
    return mapOf("uri" to uri, "title" to (title ?: ""))
  }

  fun choose(context: Context, uri: String?) {
    prefs(context).edit().apply { if (uri == null) remove(KEY) else putString(KEY, uri) }.apply()
  }

  /** À essayer dans l'ordre : la sonnerie choisie, puis celles du téléphone. */
  fun candidates(context: Context, chosen: String? = prefs(context).getString(KEY, null)): List<Uri> = listOfNotNull(
    chosen?.let { Uri.parse(it) },
    RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM),
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
  )

  /** Lecteur lancé sur la première sonnerie lisible, ou null. */
  fun play(context: Context, uris: List<Uri>, looping: Boolean): MediaPlayer? {
    for (uri in uris) {
      val p = MediaPlayer()
      try {
        p.setAudioAttributes(attributes)
        p.setDataSource(context, uri)
        p.isLooping = looping
        p.prepare()
        p.start()
        return p
      } catch (e: Exception) {
        p.release()
      }
    }
    return null
  }

  /** Écoute dans les réglages : quelques secondes de la sonnerie (null : celle du téléphone). */
  fun preview(context: Context, uri: String?) {
    stopPreview()
    preview = play(context.applicationContext, candidates(context, uri).take(if (uri == null) 4 else 1), looping = false)
    handler.postDelayed(stop, PREVIEW_MS)
  }

  fun stopPreview() {
    handler.removeCallbacks(stop)
    preview?.runCatching { stop(); release() }
    preview = null
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
