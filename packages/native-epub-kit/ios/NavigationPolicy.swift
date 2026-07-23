import Foundation

enum NavigationCommandKind: String, Sendable {
  case jump
  case logical
}

enum NavigationCommandOutcome: Equatable, Sendable {
  case success(Bool)
  case failure(String)

  var wireValue: String {
    switch self {
    case .success(true):
      return "success-true"
    case .success(false):
      return "success-false"
    case let .failure(code):
      return code
    }
  }
}

enum NavigationPolicy {
  static let maximumBridgePosition = 2_147_483_647
  private static let maximumSettledPositionDelta = 1
  private static let positionAwareTotalProgressionSettlementTolerance = 0.05
  private static let resourceProgressionSettlementTolerance = 0.12
  private static let totalProgressionSettlementTolerance = 0.005

  static func progressionIsValid(_ value: Double) -> Bool {
    value.isFinite && 0 ... 1 ~= value
  }

  static func positionIsValid(_ value: Double) -> Bool {
    value.isFinite
      && value.rounded(.towardZero) == value
      && value >= 1
      && value <= Double(maximumBridgePosition)
  }

  static func positionIsValid(_ value: Int) -> Bool {
    value >= 1 && value <= maximumBridgePosition
  }

  static func locatorSettled(
    resourceMatches: Bool,
    currentPosition: Int?,
    targetPosition: Int?,
    currentProgression: Double?,
    targetProgression: Double?,
    currentTotalProgression: Double?,
    targetTotalProgression: Double?
  ) -> Bool {
    let positionDelta: Int?
    if let currentPosition, let targetPosition {
      positionDelta = abs(currentPosition - targetPosition)
    } else {
      positionDelta = nil
    }
    if let positionDelta, positionDelta > maximumSettledPositionDelta {
      return false
    }

    if let currentTotalProgression, let targetTotalProgression {
      guard currentTotalProgression.isFinite, targetTotalProgression.isFinite else {
        return false
      }
      let tolerance: Double
      if let positionDelta {
        tolerance = positionDelta == 0
          && (targetTotalProgression == 0 || targetTotalProgression == 1)
          ? 1
          : positionAwareTotalProgressionSettlementTolerance
      } else {
        tolerance = totalProgressionSettlementTolerance
      }
      return abs(currentTotalProgression - targetTotalProgression) <= tolerance
    }

    guard resourceMatches else { return false }
    guard let targetProgression, let currentProgression else { return true }
    return targetProgression.isFinite
      && currentProgression.isFinite
      && abs(targetProgression - currentProgression) <= resourceProgressionSettlementTolerance
  }

  static func outcome(command: NavigationCommandKind, moved: Bool) -> NavigationCommandOutcome {
    if moved {
      return .success(true)
    }
    return command == .logical ? .success(false) : .failure("NAVIGATION_FAILED")
  }

  static func initialLocationReason(
    hasLocator: Bool,
    preferenceChange: Bool
  ) -> StableReaderLocationReason {
    if preferenceChange {
      return .preferenceChange
    }
    return hasLocator ? .restored : .initial
  }
}
