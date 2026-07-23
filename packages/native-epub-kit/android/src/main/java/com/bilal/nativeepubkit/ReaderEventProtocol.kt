package com.bilal.nativeepubkit

internal enum class StableReaderState(val wireValue: String) {
  IDLE("idle"),
  OPENING("opening"),
  WAITING_FOR_HOST("waitingForHost"),
  READY("ready"),
  ERROR("error"),
  CLOSING("closing"),
  UNMOUNTED("unmounted");

  companion object {
    fun fromWireValue(value: String): StableReaderState = entries.first { it.wireValue == value }
  }
}

internal enum class StableReaderCommandErrorCode(val wireValue: String) {
  READER_NOT_READY("READER_NOT_READY"),
  READER_DESTROYED("READER_DESTROYED"),
}

internal enum class StableReaderLocationReason(val wireValue: String) {
  INITIAL("initial"),
  USER_SCROLL("user-scroll"),
  USER_PAGE_TURN("user-page-turn"),
  PROGRAMMATIC("programmatic"),
  PREFERENCE_CHANGE("preference-change"),
  RESTORED("restored");

  companion object {
    fun fromWireValue(value: String): StableReaderLocationReason =
      entries.first { it.wireValue == value }
  }
}

internal class ReaderEventProtocol {
  private var generation = -1L
  private var nextSequence = 0L
  private var lastLocationTimestampMilliseconds: Long? = null

  fun nextEvent(nextGeneration: Long): Long? {
    if (nextGeneration < 0 || nextGeneration < generation) return null
    if (nextGeneration > generation) {
      generation = nextGeneration
      nextSequence = 0
      lastLocationTimestampMilliseconds = null
    }
    return nextSequence++
  }

  fun nextLocation(
    nextGeneration: Long,
    reason: StableReaderLocationReason,
    timestampMilliseconds: Long,
  ): Long? {
    if (timestampMilliseconds < 0 || nextGeneration < generation) return null
    if (nextGeneration > generation) {
      generation = nextGeneration
      nextSequence = 0
      lastLocationTimestampMilliseconds = null
    }
    val lastTimestamp = lastLocationTimestampMilliseconds
    if (
      reason == StableReaderLocationReason.USER_SCROLL &&
      lastTimestamp != null &&
      timestampMilliseconds - lastTimestamp < LOCATION_THROTTLE_MILLISECONDS
    ) {
      return null
    }
    val sequence = nextEvent(nextGeneration) ?: return null
    lastLocationTimestampMilliseconds = timestampMilliseconds
    return sequence
  }

  companion object {
    const val LOCATION_THROTTLE_MILLISECONDS = 120L

    fun commandErrorCode(
      state: StableReaderState,
      destroyed: Boolean,
    ): StableReaderCommandErrorCode? = when {
      destroyed -> StableReaderCommandErrorCode.READER_DESTROYED
      state == StableReaderState.READY -> null
      else -> StableReaderCommandErrorCode.READER_NOT_READY
    }
  }
}
