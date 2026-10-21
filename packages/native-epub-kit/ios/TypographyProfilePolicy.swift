import Foundation

enum TypographyPublisherStyleMode: String, Codable, CaseIterable, Sendable {
  case preserve
  case hybrid
  case override

  var publisherStyles: Bool { self != .override }
  var injectsProfileRules: Bool { self != .preserve }
}

struct TypographyRuleTarget: Equatable, Sendable {
  let kind: String
  let value: String
}

struct ReaderColorProfile: Equatable, Sendable {
  let background: String
  let link: String
  let text: String
}

struct TypographyRule: Equatable, Sendable {
  let borderTop: String?
  let target: TypographyRuleTarget
  let color: String?
  let fontFamilies: [String]?
  let direction: String?
  let lineHeight: Double?
  let fontWeight: Int?
}

struct ResolvedTypographyProfile: Equatable, Sendable {
  let publisherStyles: TypographyPublisherStyleMode
  let colors: ReaderColorProfile?
  let defaultFontFamilies: [String]
  let rules: [TypographyRule]

  var stylesheet: String {
    TypographyProfilePolicy.stylesheet(self)
  }
}

struct TypographyProfileValidation: Equatable, Sendable {
  let status: String
  let profile: ResolvedTypographyProfile?
  let stylesheet: String
}

enum TypographyProfilePolicy {
  static let maximumRules = 32
  static let maximumFontFamilies = 8
  static let minimumLineHeight = 0.5
  static let maximumLineHeight = 4.0
  static let minimumFontWeight = 1
  static let maximumFontWeight = 1000

  private static let profileKeys = Set(["colors", "defaultFontFamilies", "publisherStyles", "rules"])
  private static let colorKeys = Set(["background", "link", "text"])
  private static let ruleKeys = Set(
    ["borderTop", "color", "direction", "fontFamilies", "fontWeight", "lineHeight", "target"]
  )
  private static let targetKeys = Set(["kind", "value"])
  private static let genericFamilies = Set(
    ["cursive", "fantasy", "monospace", "sans-serif", "serif", "system-ui"]
  )

  static func validate(
    _ value: SharedJSONValue?,
    availableFontFamilies: Set<String>? = nil
  ) -> TypographyProfileValidation {
    guard let value, value != .null else {
      return empty(status: "absent")
    }
    do {
      let profile = try resolve(value, availableFontFamilies: availableFontFamilies)
      return TypographyProfileValidation(
        status: "valid",
        profile: profile,
        stylesheet: stylesheet(profile)
      )
    } catch {
      return empty(status: "invalid")
    }
  }

  static func resolve(
    _ value: SharedJSONValue,
    availableFontFamilies: Set<String>? = nil
  ) throws -> ResolvedTypographyProfile {
    guard case let .object(object) = value, Set(object.keys).isSubset(of: profileKeys) else {
      throw ValidationError.invalid
    }
    guard
      case let .string(modeValue)? = object["publisherStyles"],
      let mode = TypographyPublisherStyleMode(rawValue: modeValue)
    else {
      throw ValidationError.invalid
    }
    let defaultFontFamilies = try readFontFamilies(
      object["defaultFontFamilies"],
      allowEmpty: true,
      availableFontFamilies: availableFontFamilies
    )
    let rawRules: [SharedJSONValue]
    if let value = object["rules"] {
      guard case let .array(array) = value else { throw ValidationError.invalid }
      rawRules = array
    } else {
      rawRules = []
    }
    guard rawRules.count <= maximumRules else { throw ValidationError.invalid }
    let rules = try rawRules.map {
      try resolveRule($0, availableFontFamilies: availableFontFamilies)
    }
    let colors = try object["colors"].map(resolveColors)
    return ResolvedTypographyProfile(
      publisherStyles: mode,
      colors: colors,
      defaultFontFamilies: defaultFontFamilies,
      rules: rules
    )
  }

  static func stylesheet(_ profile: ResolvedTypographyProfile) -> String {
    guard profile.publisherStyles.injectsProfileRules else { return "" }
    var lines: [String] = []
    if let colors = profile.colors {
      lines.append(
        ":root, body { background-color: \(colors.background) !important; color: \(colors.text) !important; }"
      )
      lines.append(":root a:link:link:link, :root a:link:link:link *, :root a:visited:visited:visited, :root a:visited:visited:visited * { color: \(colors.link) !important; }")
    }
    if profile.publisherStyles == .override, !profile.defaultFontFamilies.isEmpty {
      lines.append(
        ":root, body, body * { font-family: \(fontFamilyList(profile.defaultFontFamilies)) !important; }"
      )
    }
    for rule in profile.rules {
      var declarations: [String] = []
      let families = rule.fontFamilies ?? profile.defaultFontFamilies
      if !families.isEmpty {
        declarations.append("font-family: \(fontFamilyList(families)) !important;")
      }
      if let color = rule.color {
        declarations.append("color: \(color) !important;")
      }
      if let direction = rule.direction {
        declarations.append("direction: \(direction) !important;")
      }
      if let lineHeight = rule.lineHeight {
        declarations.append("line-height: \(format(lineHeight)) !important;")
      }
      if let fontWeight = rule.fontWeight {
        declarations.append("font-weight: \(fontWeight) !important;")
      }
      if rule.borderTop != nil {
        declarations.append("border-top: none !important;")
      }
      lines.append("\(selector(rule.target)) { \(declarations.joined(separator: " ")) }")
    }
    return lines.joined(separator: "\n")
  }

  private static func resolveRule(
    _ value: SharedJSONValue,
    availableFontFamilies: Set<String>?
  ) throws -> TypographyRule {
    guard
      case let .object(object) = value,
      Set(object.keys).isSubset(of: ruleKeys),
      let targetValue = object["target"]
    else {
      throw ValidationError.invalid
    }
    let target = try resolveTarget(targetValue)
    let color = try object["color"].map { try normalizeColor($0) }
    let fontFamilies: [String]?
    if let value = object["fontFamilies"] {
      fontFamilies = try readFontFamilies(
        value,
        allowEmpty: false,
        availableFontFamilies: availableFontFamilies
      )
    } else {
      fontFamilies = nil
    }
    let direction: String?
    if let value = object["direction"] {
      guard case let .string(raw) = value, ["ltr", "rtl"].contains(raw) else {
        throw ValidationError.invalid
      }
      direction = raw
    } else {
      direction = nil
    }
    let lineHeight: Double?
    if let value = object["lineHeight"] {
      let number = try exactNumber(value)
      guard (minimumLineHeight ... maximumLineHeight).contains(number) else {
        throw ValidationError.invalid
      }
      lineHeight = number
    } else {
      lineHeight = nil
    }
    let fontWeight: Int?
    if let value = object["fontWeight"] {
      let number = try exactNumber(value)
      guard
        number.rounded() == number,
        number >= Double(minimumFontWeight),
        number <= Double(maximumFontWeight)
      else {
        throw ValidationError.invalid
      }
      fontWeight = Int(number)
    } else {
      fontWeight = nil
    }
    let borderTop: String?
    if let value = object["borderTop"] {
      guard case let .string(raw) = value, raw == "none" else { throw ValidationError.invalid }
      borderTop = raw
    } else {
      borderTop = nil
    }
    guard color != nil || fontFamilies != nil || direction != nil || lineHeight != nil || fontWeight != nil || borderTop != nil else {
      throw ValidationError.invalid
    }
    return TypographyRule(
      borderTop: borderTop,
      target: target,
      color: color,
      fontFamilies: fontFamilies,
      direction: direction,
      lineHeight: lineHeight,
      fontWeight: fontWeight
    )
  }

  private static func resolveColors(_ value: SharedJSONValue) throws -> ReaderColorProfile {
    guard case let .object(object) = value, Set(object.keys) == colorKeys else {
      throw ValidationError.invalid
    }
    guard
      let background = object["background"],
      let link = object["link"],
      let text = object["text"]
    else {
      throw ValidationError.invalid
    }
    return ReaderColorProfile(
      background: try normalizeColor(background),
      link: try normalizeColor(link),
      text: try normalizeColor(text)
    )
  }

  private static func normalizeColor(_ value: SharedJSONValue) throws -> String {
    guard case let .string(raw) = value else { throw ValidationError.invalid }
    let characters = Array(raw)
    guard
      characters.count == 7,
      characters.first == "#",
      characters.dropFirst().allSatisfy({ $0.isASCII && $0.isHexDigit })
    else {
      throw ValidationError.invalid
    }
    return raw.uppercased()
  }

  private static func resolveTarget(_ value: SharedJSONValue) throws -> TypographyRuleTarget {
    guard
      case let .object(object) = value,
      Set(object.keys) == targetKeys,
      case let .string(kind)? = object["kind"],
      case let .string(rawValue)? = object["value"]
    else {
      throw ValidationError.invalid
    }
    switch kind {
    case "language":
      guard validLanguage(rawValue) else { throw ValidationError.invalid }
      return TypographyRuleTarget(kind: kind, value: rawValue.lowercased())
    case "direction":
      guard ["ltr", "rtl"].contains(rawValue) else { throw ValidationError.invalid }
      return TypographyRuleTarget(kind: kind, value: rawValue)
    case "class":
      guard validClass(rawValue) else { throw ValidationError.invalid }
      return TypographyRuleTarget(kind: kind, value: rawValue)
    default:
      throw ValidationError.invalid
    }
  }

  private static func readFontFamilies(
    _ value: SharedJSONValue?,
    allowEmpty: Bool,
    availableFontFamilies: Set<String>?
  ) throws -> [String] {
    guard let value else { return [] }
    guard case let .array(values) = value, values.count <= maximumFontFamilies else {
      throw ValidationError.invalid
    }
    guard allowEmpty || !values.isEmpty else { throw ValidationError.invalid }
    var seen = Set<String>()
    return try values.map { value in
      guard case let .string(family) = value, validFamily(family), seen.insert(family).inserted else {
        throw ValidationError.invalid
      }
      if
        let availableFontFamilies,
        !genericFamilies.contains(family),
        !availableFontFamilies.contains(family)
      {
        throw ValidationError.invalid
      }
      return family
    }
  }

  private static func validFamily(_ value: String) -> Bool {
    !value.isEmpty
      && value.utf16.count <= 128
      && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
      && value == value.precomposedStringWithCanonicalMapping
      && !value.unicodeScalars.contains { $0.value <= 0x1F || $0.value == 0x7F }
  }

  private static func validLanguage(_ value: String) -> Bool {
    guard value.utf8.count <= 63 else { return false }
    let parts = value.split(separator: "-", omittingEmptySubsequences: false)
    guard let first = parts.first, (2 ... 8).contains(first.count), first.allSatisfy(asciiLetter) else {
      return false
    }
    return parts.dropFirst().allSatisfy { part in
      (1 ... 8).contains(part.count) && part.allSatisfy { asciiLetter($0) || $0.isNumber && $0.isASCII }
    }
  }

  private static func validClass(_ value: String) -> Bool {
    guard !value.isEmpty, value.utf8.count <= 64, let first = value.first else { return false }
    guard first.isASCII && (first.isLetter || first == "_") else { return false }
    return value.dropFirst().allSatisfy {
      $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-")
    }
  }

  private static func asciiLetter(_ character: Character) -> Bool {
    character.isASCII && character.isLetter
  }

  private static func exactNumber(_ value: SharedJSONValue) throws -> Double {
    switch value {
    case let .integer(number):
      return Double(number)
    case let .number(number) where number.isFinite:
      return number
    default:
      throw ValidationError.invalid
    }
  }

  private static func selector(_ target: TypographyRuleTarget) -> String {
    switch target.kind {
    case "language":
      return ":root :lang(\(target.value)):lang(\(target.value)), :root [lang|=\"\(target.value)\"][lang|=\"\(target.value)\"]"
    case "direction":
      return ":root :dir(\(target.value)):dir(\(target.value)), :root [dir=\"\(target.value)\"][dir=\"\(target.value)\"]"
    default:
      return ":root .\(target.value).\(target.value)"
    }
  }

  private static func fontFamilyList(_ families: [String]) -> String {
    families.map { family in
      if genericFamilies.contains(family) { return family }
      let escaped = family
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
      return "\"\(escaped)\""
    }.joined(separator: ", ")
  }

  private static func format(_ value: Double) -> String {
    value.rounded() == value ? String(Int(value)) : String(value)
  }

  private static func empty(status: String) -> TypographyProfileValidation {
    TypographyProfileValidation(status: status, profile: nil, stylesheet: "")
  }

  private enum ValidationError: Error {
    case invalid
  }
}
