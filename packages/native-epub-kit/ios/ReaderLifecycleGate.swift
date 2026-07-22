final class ReaderLifecycleGate {
  private var generation = -1
  private var state: String?

  func accept(_ nextState: String, generation nextGeneration: Int) -> Bool {
    guard nextGeneration >= 0, nextGeneration >= generation else {
      return false
    }

    if nextGeneration > generation {
      guard Self.newGenerationStates.contains(nextState) else {
        return false
      }
      generation = nextGeneration
      state = nextState
      return true
    }

    guard let currentState = state else {
      guard Self.newGenerationStates.contains(nextState) else {
        return false
      }
      state = nextState
      return true
    }

    guard
      currentState != nextState,
      Self.transitions[currentState]?.contains(nextState) == true
    else {
      return false
    }

    state = nextState
    return true
  }

  private static let newGenerationStates: Set<String> = [
    "idle", "opening", "closing", "unmounted",
  ]

  private static let transitions: [String: Set<String>] = [
    "idle": ["opening", "unmounted"],
    "opening": ["waitingForHost", "ready", "error", "closing", "unmounted"],
    "waitingForHost": ["ready", "error", "closing", "unmounted"],
    "ready": ["error", "closing", "unmounted"],
    "error": ["closing", "idle", "opening", "unmounted"],
    "closing": ["idle", "opening", "unmounted"],
    "unmounted": ["idle", "opening"],
  ]
}
