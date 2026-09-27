package expo.modules.alarmclock

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Juste avant de sonner, relit Health Connect : si le suivi est déjà rempli (objectif de pas atteint,
 * nuit de sommeil enregistrée), l'alarme n'a plus lieu d'être. Au moindre doute (pas d'accès,
 * Health Connect absent, trop lent), on considère que ce n'est pas fait : l'alarme sonne.
 * Bloquant : à appeler hors du fil principal.
 */
object HealthCheck {
  private const val TIMEOUT_MS = 8_000L

  fun isDone(context: Context, check: JSONObject): Boolean = try {
    runBlocking { withTimeoutOrNull(TIMEOUT_MS) { query(context, check) } ?: false }
  } catch (t: Throwable) {
    false
  }

  private suspend fun query(context: Context, check: JSONObject): Boolean {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return false
    val client = HealthConnectClient.getOrCreate(context)
    val zone = ZoneId.systemDefault()
    val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
    val now = Instant.now()
    return when (check.optString("metric")) {
      "steps" -> {
        val goal = check.optDouble("goal", 0.0)
        if (goal <= 0) return false
        val res = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(startOfDay, now)))
        (res[StepsRecord.COUNT_TOTAL] ?: 0L) >= goal
      }
      // La nuit qui finit aujourd'hui (comme l'import de l'app : une nuit compte pour son jour de lever).
      "sleep" -> {
        val res = client.readRecords(
          ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(startOfDay.minus(Duration.ofDays(1)), now)),
        )
        res.records.any { !it.endTime.isBefore(startOfDay) }
      }
      else -> false
    }
  }
}
