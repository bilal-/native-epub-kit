package com.bilal.nativeepubkit

internal enum class NavigationCommandKind {
  JUMP,
  LOGICAL,
}

internal sealed interface NavigationCommandOutcome {
  val wireValue: String

  data class Success(val moved: Boolean) : NavigationCommandOutcome {
    override val wireValue = if (moved) "success-true" else "success-false"
  }

  data class Failure(val code: String) : NavigationCommandOutcome {
    override val wireValue = code
  }
}

internal object NavigationPolicy {
  const val MAXIMUM_BRIDGE_POSITION = Int.MAX_VALUE
  private const val MAXIMUM_SETTLED_POSITION_DELTA = 1L
  private const val POSITION_AWARE_TOTAL_PROGRESSION_SETTLEMENT_TOLERANCE = 0.05
  private const val RESOURCE_PROGRESSION_SETTLEMENT_TOLERANCE = 0.12
  private const val TOTAL_PROGRESSION_SETTLEMENT_TOLERANCE = 0.005

  fun progressionIsValid(value: Double): Boolean = value.isFinite() && value in 0.0..1.0

  fun positionIsValid(value: Double): Boolean =
    value.isFinite() &&
      value % 1.0 == 0.0 &&
      value >= 1.0 &&
      value <= MAXIMUM_BRIDGE_POSITION.toDouble()

  fun positionIsValid(value: Int): Boolean = value >= 1

  fun fragmentsSettled(
    resourceMatches: Boolean,
    currentFragments: List<String>,
    currentCssSelector: String? = null,
    targetElementVisible: Boolean = false,
    targetFragments: List<String>,
  ): Boolean {
    if (!resourceMatches || targetFragments.isEmpty()) return false
    if (targetElementVisible) return true
    val current = currentFragments.mapTo(mutableSetOf()) { it.trim().trimStart('#') }
    currentCssSelector?.let { current += it.trim().trimStart('#') }
    if (current.isEmpty()) return false
    return targetFragments.any { it.trim().trimStart('#') in current }
  }

  fun locatorSettled(
    resourceMatches: Boolean,
    currentPosition: Int?,
    targetPosition: Int?,
    currentProgression: Double?,
    targetProgression: Double?,
    currentTotalProgression: Double?,
    targetTotalProgression: Double?,
  ): Boolean {
    val positionDelta = currentPosition?.let { current ->
      targetPosition?.let { target -> kotlin.math.abs(current.toLong() - target.toLong()) }
    }
    val positionIsWithinTolerance =
      positionDelta == null || positionDelta <= MAXIMUM_SETTLED_POSITION_DELTA

    if (currentTotalProgression != null && targetTotalProgression != null) {
      if (!currentTotalProgression.isFinite() || !targetTotalProgression.isFinite()) return false
      val totalProgressionDelta =
        kotlin.math.abs(currentTotalProgression - targetTotalProgression)
      return totalProgressionDelta <= if (positionDelta != null && positionIsWithinTolerance) {
        if (
          positionDelta == 0L &&
          (targetTotalProgression == 0.0 || targetTotalProgression == 1.0)
        ) {
          1.0
        } else {
          POSITION_AWARE_TOTAL_PROGRESSION_SETTLEMENT_TOLERANCE
        }
      } else {
        TOTAL_PROGRESSION_SETTLEMENT_TOLERANCE
      }
    }

    if (!resourceMatches) return false
    if (targetProgression != null && currentProgression != null) {
      return targetProgression.isFinite() &&
        currentProgression.isFinite() &&
        kotlin.math.abs(targetProgression - currentProgression) <=
        RESOURCE_PROGRESSION_SETTLEMENT_TOLERANCE
    }
    return positionIsWithinTolerance
  }

  fun outcome(
    command: NavigationCommandKind,
    moved: Boolean,
  ): NavigationCommandOutcome = when {
    moved -> NavigationCommandOutcome.Success(true)
    command == NavigationCommandKind.LOGICAL -> NavigationCommandOutcome.Success(false)
    else -> NavigationCommandOutcome.Failure("NAVIGATION_FAILED")
  }

  fun initialLocationReason(
    hasLocator: Boolean,
    preferenceChange: Boolean,
  ): StableReaderLocationReason = when {
    preferenceChange -> StableReaderLocationReason.PREFERENCE_CHANGE
    hasLocator -> StableReaderLocationReason.RESTORED
    else -> StableReaderLocationReason.INITIAL
  }
}
