package com.bilal.nativeepubkit

internal class ReaderLifecycleGate {
  private var generation: Long = -1
  private var state: String? = null

  fun accept(nextState: String, nextGeneration: Long): Boolean {
    if (nextGeneration < 0 || nextGeneration < generation) return false

    if (nextGeneration > generation) {
      if (nextState !in NEW_GENERATION_STATES) return false
      generation = nextGeneration
      state = nextState
      return true
    }

    val currentState = state
    if (currentState == null) {
      if (nextState !in NEW_GENERATION_STATES) return false
      state = nextState
      return true
    }

    if (currentState == nextState || nextState !in TRANSITIONS.getValue(currentState)) {
      return false
    }

    state = nextState
    return true
  }

  private companion object {
    val NEW_GENERATION_STATES = setOf("idle", "opening", "closing", "unmounted")

    val TRANSITIONS = mapOf(
      "idle" to setOf("opening", "unmounted"),
      "opening" to setOf("waitingForHost", "ready", "error", "closing", "unmounted"),
      "waitingForHost" to setOf("ready", "error", "closing", "unmounted"),
      "ready" to setOf("error", "closing", "unmounted"),
      "error" to setOf("closing", "idle", "opening", "unmounted"),
      "closing" to setOf("idle", "opening", "unmounted"),
      "unmounted" to setOf("idle", "opening")
    )
  }
}
