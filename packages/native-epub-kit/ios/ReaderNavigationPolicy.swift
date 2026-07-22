import Foundation

enum ReaderNavigationPolicyValidationError: Error, Equatable {
  case invalid(String)
}

enum ReaderNavigationPolicyName: String, CaseIterable, Sendable {
  case pageTurnGesture
  case chapterTurnGesture
  case edgeTapNavigation
  case hardwareKeyNavigation
  case animatedTransitions
  case inputSuppressed

  var application: String {
    self == .chapterTurnGesture ? "navigator-recreation" : "live"
  }
}

struct ResolvedReaderNavigationPolicy: Equatable, Sendable {
  let pageTurnGesture: String
  let chapterTurnGesture: String
  let edgeTapNavigation: Bool
  let hardwareKeyNavigation: Bool
  let animatedTransitions: Bool
  let inputSuppressed: Bool

  static let defaults = ResolvedReaderNavigationPolicy(
    pageTurnGesture: "enabled",
    chapterTurnGesture: "disabled",
    edgeTapNavigation: false,
    hardwareKeyNavigation: true,
    animatedTransitions: false,
    inputSuppressed: false
  )

  init(validating value: SharedJSONValue?) throws {
    guard let value else {
      self = .defaults
      return
    }
    guard case let .object(object) = value else {
      throw ReaderNavigationPolicyValidationError.invalid("navigation policy must be an object")
    }
    let allowed = Set(ReaderNavigationPolicyName.allCases.map(\.rawValue))
    guard Set(object.keys).isSubset(of: allowed) else {
      throw ReaderNavigationPolicyValidationError.invalid(
        "navigation policy contains an unknown field"
      )
    }
    pageTurnGesture = try Self.gesture(
      object["pageTurnGesture"],
      fallback: Self.defaults.pageTurnGesture
    )
    chapterTurnGesture = try Self.gesture(
      object["chapterTurnGesture"],
      fallback: Self.defaults.chapterTurnGesture
    )
    edgeTapNavigation = try Self.boolean(
      object["edgeTapNavigation"],
      fallback: Self.defaults.edgeTapNavigation
    )
    hardwareKeyNavigation = try Self.boolean(
      object["hardwareKeyNavigation"],
      fallback: Self.defaults.hardwareKeyNavigation
    )
    animatedTransitions = try Self.boolean(
      object["animatedTransitions"],
      fallback: Self.defaults.animatedTransitions
    )
    inputSuppressed = try Self.boolean(
      object["inputSuppressed"],
      fallback: Self.defaults.inputSuppressed
    )
  }

  private init(
    pageTurnGesture: String,
    chapterTurnGesture: String,
    edgeTapNavigation: Bool,
    hardwareKeyNavigation: Bool,
    animatedTransitions: Bool,
    inputSuppressed: Bool
  ) {
    self.pageTurnGesture = pageTurnGesture
    self.chapterTurnGesture = chapterTurnGesture
    self.edgeTapNavigation = edgeTapNavigation
    self.hardwareKeyNavigation = hardwareKeyNavigation
    self.animatedTransitions = animatedTransitions
    self.inputSuppressed = inputSuppressed
  }

  var foundationObject: [String: Any] {
    [
      "animatedTransitions": animatedTransitions,
      "chapterTurnGesture": chapterTurnGesture,
      "edgeTapNavigation": edgeTapNavigation,
      "hardwareKeyNavigation": hardwareKeyNavigation,
      "inputSuppressed": inputSuppressed,
      "pageTurnGesture": pageTurnGesture,
    ]
  }

  private static func gesture(_ value: SharedJSONValue?, fallback: String) throws -> String {
    guard let value else { return fallback }
    guard case let .string(string) = value, ["enabled", "disabled"].contains(string) else {
      throw ReaderNavigationPolicyValidationError.invalid("navigation gesture value is invalid")
    }
    return string
  }

  private static func boolean(_ value: SharedJSONValue?, fallback: Bool) throws -> Bool {
    guard let value else { return fallback }
    guard case let .boolean(boolean) = value else {
      throw ReaderNavigationPolicyValidationError.invalid("navigation policy boolean is invalid")
    }
    return boolean
  }
}

enum ReaderNavigationPolicy {
  static func requiresNavigatorRecreation(
    previous: ResolvedReaderNavigationPolicy,
    next: ResolvedReaderNavigationPolicy
  ) -> Bool {
    previous.chapterTurnGesture != next.chapterTurnGesture
  }

  static func rejectsUserMovement(
    policy: ResolvedReaderNavigationPolicy,
    effectiveLayout: String,
    resourceChanged: Bool
  ) -> Bool {
    if resourceChanged {
      return policy.inputSuppressed || policy.chapterTurnGesture == "disabled"
    }
    if effectiveLayout == "paginated" {
      return policy.inputSuppressed || policy.pageTurnGesture == "disabled"
    }
    return false
  }

  static func statusPayload(
    policy: ResolvedReaderNavigationPolicy,
    application: String,
    boundaryGranularity: String = "reading-order-resource",
    boundaryPrecision: String = "resource",
    boundaryWarnings: [String] = ["chapter-boundaries-use-reading-order-resources"],
    effectiveLayout: String,
    readingProgression: String,
    instanceId: String,
    generation: Int
  ) -> [String: Any] {
    [
      "application": application,
      "applied": policy.foundationObject,
      "boundaryGranularity": boundaryGranularity,
      "boundaryPrecision": boundaryPrecision,
      "effectiveLayout": effectiveLayout,
      "generation": generation,
      "instanceId": instanceId,
      "readingProgression": readingProgression,
      "requested": policy.foundationObject,
      "support": ReaderNavigationPolicyName.allCases.map {
        [
          "application": $0.application,
          "name": $0.rawValue,
          "supported": true,
        ] as [String: Any]
      },
      "warnings": boundaryWarnings,
    ]
  }
}
