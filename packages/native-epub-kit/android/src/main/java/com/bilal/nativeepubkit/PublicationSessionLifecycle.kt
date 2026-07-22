package com.bilal.nativeepubkit

import kotlin.math.pow
import kotlin.math.roundToLong

internal enum class PublicationSessionLifecycleState(val wireValue: String) {
  INITIALIZED("initialized"),
  RESOLVING("resolving"),
  RETRIEVING("retrieving"),
  OPENING("opening"),
  READY("ready"),
  FAILED("failed"),
  CLOSING("closing"),
  CLOSED("closed");

  companion object {
    fun fromWireValue(value: String): PublicationSessionLifecycleState =
      entries.first { it.wireValue == value }
  }
}

internal class PublicationSessionLifecycle {
  var state = PublicationSessionLifecycleState.INITIALIZED
    private set

  fun transition(nextState: PublicationSessionLifecycleState): Boolean {
    if (nextState == state || nextState !in TRANSITIONS.getValue(state)) return false
    state = nextState
    return true
  }

  private companion object {
    val TRANSITIONS = mapOf(
      PublicationSessionLifecycleState.INITIALIZED to
        setOf(PublicationSessionLifecycleState.RESOLVING, PublicationSessionLifecycleState.CLOSING),
      PublicationSessionLifecycleState.RESOLVING to
        setOf(
          PublicationSessionLifecycleState.RETRIEVING,
          PublicationSessionLifecycleState.FAILED,
          PublicationSessionLifecycleState.CLOSING,
        ),
      PublicationSessionLifecycleState.RETRIEVING to
        setOf(
          PublicationSessionLifecycleState.OPENING,
          PublicationSessionLifecycleState.FAILED,
          PublicationSessionLifecycleState.CLOSING,
        ),
      PublicationSessionLifecycleState.OPENING to
        setOf(
          PublicationSessionLifecycleState.READY,
          PublicationSessionLifecycleState.FAILED,
          PublicationSessionLifecycleState.CLOSING,
        ),
      PublicationSessionLifecycleState.READY to
        setOf(PublicationSessionLifecycleState.FAILED, PublicationSessionLifecycleState.CLOSING),
      PublicationSessionLifecycleState.FAILED to setOf(PublicationSessionLifecycleState.CLOSING),
      PublicationSessionLifecycleState.CLOSING to setOf(PublicationSessionLifecycleState.CLOSED),
      PublicationSessionLifecycleState.CLOSED to emptySet(),
    )
  }
}

internal data class PublicationSessionResourceSnapshot(
  val activeSessions: Int,
  val ownedAssets: Int,
  val ownedPublications: Int,
  val sourceLeases: Int,
  val completedSessions: Int,
  val forcedReleaseViolations: Int,
  val maximumActiveSessions: Int,
  val maximumOwnedAssets: Int,
  val maximumOwnedPublications: Int,
  val maximumSourceLeases: Int,
  val memorySamples: List<Long>,
) {
  val latestMemoryBytes: Long?
    get() = memorySamples.lastOrNull()

  val postWarmupGrowthBytes: Long?
    get() = memorySamples
      .takeIf { it.size > PublicationSessionResourceLedger.WARMUP_SAMPLE_COUNT }
      ?.let { it.last() - it[PublicationSessionResourceLedger.WARMUP_SAMPLE_COUNT - 1] }

  val postWarmupSlopeBytesPerCycle: Long?
    get() {
      val samples = memorySamples.drop(PublicationSessionResourceLedger.WARMUP_SAMPLE_COUNT)
      if (samples.size < 2) return null
      val meanX = samples.indices.average()
      val meanY = samples.average()
      val numerator = samples.indices.sumOf { index ->
        (index - meanX) * (samples[index] - meanY)
      }
      val denominator = samples.indices.sumOf { index -> (index - meanX).pow(2) }
      return if (denominator == 0.0) 0 else (numerator / denominator).roundToLong()
    }

  val postWarmupMemoryIsBounded: Boolean?
    get() {
      val growth = postWarmupGrowthBytes ?: return null
      val slope = postWarmupSlopeBytesPerCycle ?: return null
      return growth <= PublicationSessionResourceLedger.MAXIMUM_POST_WARMUP_GROWTH_BYTES &&
        slope <= PublicationSessionResourceLedger.MAXIMUM_POST_WARMUP_SLOPE_BYTES_PER_CYCLE
    }
}

internal class PublicationSessionResourceLedger {
  private data class Entry(
    val state: PublicationSessionLifecycleState = PublicationSessionLifecycleState.INITIALIZED,
    val ownsAsset: Boolean = false,
    val ownsPublication: Boolean = false,
    val ownsSourceLease: Boolean = false,
  )

  private val entries = mutableMapOf<String, Entry>()
  private var completedSessions = 0
  private var forcedReleaseViolations = 0
  private var maximumActiveSessions = 0
  private var maximumOwnedAssets = 0
  private var maximumOwnedPublications = 0
  private var maximumSourceLeases = 0
  private val memorySamples = mutableListOf<Long>()

  @Synchronized
  fun register(id: String) {
    check(id !in entries) { "Publication session registered twice" }
    entries[id] = Entry()
    updateHighWatermarks()
  }

  @Synchronized
  fun update(
    id: String,
    state: PublicationSessionLifecycleState,
    ownsAsset: Boolean,
    ownsPublication: Boolean,
    ownsSourceLease: Boolean,
  ) {
    if (id !in entries) return
    entries[id] = Entry(state, ownsAsset, ownsPublication, ownsSourceLease)
    updateHighWatermarks()
  }

  @Synchronized
  fun unregister(id: String, residentMemoryBytes: Long? = null) {
    val entry = entries.remove(id) ?: return
    if (entry.ownsAsset || entry.ownsPublication || entry.ownsSourceLease) {
      forcedReleaseViolations += 1
    }
    completedSessions += 1
    residentMemoryBytes?.takeIf { it >= 0 }?.let(memorySamples::add)
  }

  @Synchronized
  fun snapshot(): PublicationSessionResourceSnapshot = PublicationSessionResourceSnapshot(
    activeSessions = entries.size,
    ownedAssets = entries.values.count { it.ownsAsset },
    ownedPublications = entries.values.count { it.ownsPublication },
    sourceLeases = entries.values.count { it.ownsSourceLease },
    completedSessions = completedSessions,
    forcedReleaseViolations = forcedReleaseViolations,
    maximumActiveSessions = maximumActiveSessions,
    maximumOwnedAssets = maximumOwnedAssets,
    maximumOwnedPublications = maximumOwnedPublications,
    maximumSourceLeases = maximumSourceLeases,
    memorySamples = memorySamples.toList(),
  )

  private fun updateHighWatermarks() {
    maximumActiveSessions = maxOf(maximumActiveSessions, entries.size)
    maximumOwnedAssets = maxOf(maximumOwnedAssets, entries.values.count { it.ownsAsset })
    maximumOwnedPublications = maxOf(
      maximumOwnedPublications,
      entries.values.count { it.ownsPublication },
    )
    maximumSourceLeases = maxOf(maximumSourceLeases, entries.values.count { it.ownsSourceLease })
  }

  internal companion object {
    const val WARMUP_SAMPLE_COUNT = 5
    const val MAXIMUM_POST_WARMUP_GROWTH_BYTES = 64L * 1_024 * 1_024
    const val MAXIMUM_POST_WARMUP_SLOPE_BYTES_PER_CYCLE = 4L * 1_024 * 1_024
  }
}
