import Foundation

enum ReaderPreferencesValidationError: Error, Equatable {
  case invalid(String)
}

enum ReaderPreferenceName: String, CaseIterable, Sendable {
  case theme
  case fontSize
  case layout
  case spread
  case pageMargins
  case lineHeight
  case textAlignment
  case publisherStyles
  case readingProgression
}

struct ResolvedReaderPreferences: Equatable, Sendable {
  let theme: String
  let fontSize: Double
  let layout: String
  let spread: String
  let pageMargins: Double
  let lineHeight: Double
  let textAlignment: String
  let publisherStyles: Bool
  let readingProgression: String

  static let defaults = ResolvedReaderPreferences(
    theme: "light",
    fontSize: 1,
    layout: "scrolled",
    spread: "auto",
    pageMargins: 1,
    lineHeight: 1.2,
    textAlignment: "auto",
    publisherStyles: true,
    readingProgression: "auto"
  )

  init(validating value: SharedJSONValue?) throws {
    guard let value else {
      self = .defaults
      return
    }
    guard case let .object(object) = value else {
      throw ReaderPreferencesValidationError.invalid("preferences must be an object")
    }
    let allowed = Set(ReaderPreferenceName.allCases.map(\.rawValue))
    guard Set(object.keys).isSubset(of: allowed) else {
      throw ReaderPreferencesValidationError.invalid("preferences contain an unknown field")
    }
    theme = try Self.enumValue(object["theme"], fallback: "light", allowed: [
      "light", "dark", "sepia",
    ])
    fontSize = try Self.number(
      object["fontSize"], fallback: 1, range: ReaderPreferencesPolicy.fontSizeRange
    )
    layout = try Self.enumValue(object["layout"], fallback: "scrolled", allowed: [
      "scrolled", "paginated",
    ])
    spread = try Self.enumValue(object["spread"], fallback: "auto", allowed: [
      "auto", "never", "always",
    ])
    pageMargins = try Self.number(
      object["pageMargins"], fallback: 1, range: ReaderPreferencesPolicy.pageMarginsRange
    )
    lineHeight = try Self.number(
      object["lineHeight"], fallback: 1.2, range: ReaderPreferencesPolicy.lineHeightRange
    )
    textAlignment = try Self.enumValue(
      object["textAlignment"],
      fallback: "auto",
      allowed: ["auto", "start", "end", "left", "right", "center", "justify"]
    )
    if let value = object["publisherStyles"] {
      guard case let .boolean(boolean) = value else {
        throw ReaderPreferencesValidationError.invalid("publisherStyles must be a boolean")
      }
      publisherStyles = boolean
    } else {
      publisherStyles = true
    }
    readingProgression = try Self.enumValue(
      object["readingProgression"],
      fallback: "auto",
      allowed: ["auto", "ltr", "rtl"]
    )
  }

  private init(
    theme: String,
    fontSize: Double,
    layout: String,
    spread: String,
    pageMargins: Double,
    lineHeight: Double,
    textAlignment: String,
    publisherStyles: Bool,
    readingProgression: String
  ) {
    self.theme = theme
    self.fontSize = fontSize
    self.layout = layout
    self.spread = spread
    self.pageMargins = pageMargins
    self.lineHeight = lineHeight
    self.textAlignment = textAlignment
    self.publisherStyles = publisherStyles
    self.readingProgression = readingProgression
  }

  var foundationObject: [String: Any] {
    [
      "fontSize": fontSize,
      "layout": layout,
      "lineHeight": lineHeight,
      "pageMargins": pageMargins,
      "publisherStyles": publisherStyles,
      "readingProgression": readingProgression,
      "spread": spread,
      "textAlignment": textAlignment,
      "theme": theme,
    ]
  }

  var jsonValue: SharedJSONValue {
    .object([
      "fontSize": .number(fontSize),
      "layout": .string(layout),
      "lineHeight": .number(lineHeight),
      "pageMargins": .number(pageMargins),
      "publisherStyles": .boolean(publisherStyles),
      "readingProgression": .string(readingProgression),
      "spread": .string(spread),
      "textAlignment": .string(textAlignment),
      "theme": .string(theme),
    ])
  }

  func value(for name: ReaderPreferenceName) -> Any {
    foundationObject[name.rawValue]!
  }

  private static func enumValue(
    _ value: SharedJSONValue?,
    fallback: String,
    allowed: Set<String>
  ) throws -> String {
    guard let value else { return fallback }
    guard case let .string(string) = value, allowed.contains(string) else {
      throw ReaderPreferencesValidationError.invalid("preference enum is invalid")
    }
    return string
  }

  private static func number(
    _ value: SharedJSONValue?,
    fallback: Double,
    range: ClosedRange<Double>
  ) throws -> Double {
    guard let value else { return fallback }
    let number: Double
    switch value {
    case let .integer(integer):
      number = Double(integer)
    case let .number(double):
      number = double
    default:
      throw ReaderPreferencesValidationError.invalid("preference number is invalid")
    }
    guard number.isFinite, range.contains(number) else {
      throw ReaderPreferencesValidationError.invalid("preference number is out of range")
    }
    return number
  }
}

struct ReaderPreferenceSupport: Equatable, Sendable {
  let name: ReaderPreferenceName
  let supported: Bool
  let reason: String?

  var foundationObject: [String: Any] {
    var result: [String: Any] = [
      "name": name.rawValue,
      "supported": supported,
    ]
    if let reason {
      result["reason"] = reason
    }
    return result
  }
}

struct ReaderPreferencesPolicyResult: Equatable, Sendable {
  let appliedNames: [ReaderPreferenceName]
  let support: [ReaderPreferenceSupport]
  let warnings: [String]

  func appliedObject(from preferences: ResolvedReaderPreferences) -> [String: Any] {
    Dictionary(uniqueKeysWithValues: appliedNames.map { ($0.rawValue, preferences.value(for: $0)) })
  }
}

enum ReaderPreferencesPolicy {
  static let fontSizeRange = 0.1 ... 5.0
  static let pageMarginsRange = 0.0 ... 4.0
  static let lineHeightRange = 1.0 ... 2.0

  static func resolve(
    _ preferences: ResolvedReaderPreferences,
    fixedLayout: Bool
  ) -> ReaderPreferencesPolicyResult {
    let support = ReaderPreferenceName.allCases.map { name -> ReaderPreferenceSupport in
      if fixedLayout {
        let supported = name == .spread || name == .readingProgression
        return ReaderPreferenceSupport(
          name: name,
          supported: supported,
          reason: supported ? nil : "fixed-layout"
        )
      }
      if name == .spread {
        return ReaderPreferenceSupport(
          name: name,
          supported: false,
          reason: "reflowable-layout"
        )
      }
      if preferences.publisherStyles, name == .lineHeight || name == .textAlignment {
        return ReaderPreferenceSupport(
          name: name,
          supported: false,
          reason: "publisher-styles"
        )
      }
      return ReaderPreferenceSupport(name: name, supported: true, reason: nil)
    }
    let warnings = fixedLayout
      ? ["fixed-layout-reflow-preferences-disabled"]
      : ["spread-fixed-layout-only"] + (preferences.publisherStyles
        ? ["publisher-styles-disable-advanced-text"]
        : [])
    return ReaderPreferencesPolicyResult(
      appliedNames: support.filter(\.supported).map(\.name),
      support: support,
      warnings: warnings
    )
  }

  static func statusPayload(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Bool,
    instanceId: String,
    generation: Int
  ) -> [String: Any] {
    let policy = resolve(preferences, fixedLayout: fixedLayout)
    return [
      "applied": policy.appliedObject(from: preferences),
      "generation": generation,
      "instanceId": instanceId,
      "publicationLayout": fixedLayout ? "fixed" : "reflowable",
      "requested": preferences.foundationObject,
      "support": policy.support.map(\.foundationObject),
      "warnings": policy.warnings,
    ]
  }
}
