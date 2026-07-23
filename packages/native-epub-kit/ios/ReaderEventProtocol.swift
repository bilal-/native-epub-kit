import Foundation

enum StableReaderState: String, CaseIterable, Sendable {
  case idle
  case opening
  case waitingForHost
  case ready
  case error
  case closing
  case unmounted
}

enum StableReaderCommandErrorCode: String, Sendable {
  case readerNotReady = "READER_NOT_READY"
  case readerDestroyed = "READER_DESTROYED"
}

enum StableReaderLocationReason: String, Sendable {
  case initial
  case userScroll = "user-scroll"
  case userPageTurn = "user-page-turn"
  case programmatic
  case preferenceChange = "preference-change"
  case restored
}

final class ReaderEventProtocol {
  static let locationThrottleMilliseconds: Int64 = 120

  private var generation = -1
  private var nextSequence = 0
  private var lastLocationTimestampMilliseconds: Int64?

  func nextEvent(generation nextGeneration: Int) -> Int? {
    guard nextGeneration >= 0, nextGeneration >= generation else {
      return nil
    }
    if nextGeneration > generation {
      generation = nextGeneration
      nextSequence = 0
      lastLocationTimestampMilliseconds = nil
    }
    let sequence = nextSequence
    nextSequence += 1
    return sequence
  }

  func nextLocation(
    generation nextGeneration: Int,
    reason: StableReaderLocationReason,
    timestampMilliseconds: Int64
  ) -> Int? {
    guard timestampMilliseconds >= 0, nextGeneration >= generation else {
      return nil
    }
    if nextGeneration > generation {
      generation = nextGeneration
      nextSequence = 0
      lastLocationTimestampMilliseconds = nil
    }
    if
      reason == .userScroll,
      let lastLocationTimestampMilliseconds,
      timestampMilliseconds - lastLocationTimestampMilliseconds
        < Self.locationThrottleMilliseconds
    {
      return nil
    }
    guard let sequence = nextEvent(generation: nextGeneration) else {
      return nil
    }
    lastLocationTimestampMilliseconds = timestampMilliseconds
    return sequence
  }

  static func commandErrorCode(
    state: StableReaderState,
    destroyed: Bool
  ) -> StableReaderCommandErrorCode? {
    if destroyed {
      return .readerDestroyed
    }
    return state == .ready ? nil : .readerNotReady
  }
}
