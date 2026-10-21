import Foundation

enum FootnotePolicyError: Error, Equatable {
  case invalid
}

enum FootnotePolicyMode: String, Sendable {
  case navigate
  case semantic
  case semanticAndHeuristic = "semantic-and-heuristic"
}

struct FootnoteHeuristicRule: Equatable, Sendable {
  let id: String
  let fragmentPrefix: String?
  let fragmentSuffix: String?
  let resourceSuffix: String?

  var jsonObject: [String: Any] {
    var object: [String: Any] = ["id": id]
    if let fragmentPrefix { object["fragmentPrefix"] = fragmentPrefix }
    if let fragmentSuffix { object["fragmentSuffix"] = fragmentSuffix }
    if let resourceSuffix { object["resourceSuffix"] = resourceSuffix }
    return object
  }
}

struct ResolvedFootnotePolicy: Equatable, Sendable {
  let mode: FootnotePolicyMode
  let heuristicRules: [FootnoteHeuristicRule]

  var jsonObject: [String: Any] {
    [
      "heuristicRules": heuristicRules.map(\.jsonObject),
      "mode": mode.rawValue,
    ]
  }
}

enum ExternalLinkPolicy: String, Sendable {
  case intercept
  case block
}

enum UnsupportedSchemePolicy: String, Sendable {
  case intercept
  case block
}

struct ResolvedReaderLinkPolicy: Equatable, Sendable {
  let allowedExternalSchemes: [String]
  let externalLinks: ExternalLinkPolicy
  let unsupportedSchemes: UnsupportedSchemePolicy

  var jsonObject: [String: Any] {
    [
      "allowedExternalSchemes": allowedExternalSchemes,
      "externalLinks": externalLinks.rawValue,
      "unsupportedSchemes": unsupportedSchemes.rawValue,
    ]
  }
}

struct InternalFootnoteDecision: Equatable, Sendable {
  let decision: String
  let classification: String?
  let ruleId: String?

  var jsonObject: [String: Any] {
    var object: [String: Any] = ["decision": decision]
    if let classification { object["classification"] = classification }
    if let ruleId { object["ruleId"] = ruleId }
    return object
  }
}

struct ExternalReaderLinkDecision: Equatable, Sendable {
  let kind: String
  let disposition: String
  let scheme: String?

  var jsonObject: [String: Any] {
    var object: [String: Any] = ["disposition": disposition, "kind": kind]
    if let scheme { object["scheme"] = scheme }
    return object
  }
}

enum FootnoteLinkPolicy {
  static let maximumHeuristicRules = 16
  static let maximumExternalSchemes = 16
  static let maximumMatchValueUTF16Units = 128

  static let defaultFootnote = ResolvedFootnotePolicy(mode: .semantic, heuristicRules: [])
  static let defaultLinks = ResolvedReaderLinkPolicy(
    allowedExternalSchemes: ["http", "https"],
    externalLinks: .intercept,
    unsupportedSchemes: .block
  )

  static func resolveFootnote(json: String?) throws -> ResolvedFootnotePolicy {
    guard let json else { return defaultFootnote }
    let value = try JSONSerialization.jsonObject(with: Data(json.utf8))
    return try resolveFootnote(value)
  }

  static func resolveFootnote(_ value: Any?) throws -> ResolvedFootnotePolicy {
    guard let value, !(value is NSNull) else { return defaultFootnote }
    let object = try dictionary(value)
    try exactKeys(object, allowed: ["heuristicRules", "mode"])
    guard
      let modeValue = object["mode"] as? String,
      let mode = FootnotePolicyMode(rawValue: modeValue)
    else {
      throw FootnotePolicyError.invalid
    }
    let rawRules = object["heuristicRules"] ?? []
    guard let rules = rawRules as? [Any], rules.count <= maximumHeuristicRules else {
      throw FootnotePolicyError.invalid
    }
    let resolvedRules = try rules.map(resolveRule)
    guard Set(resolvedRules.map(\.id)).count == resolvedRules.count else {
      throw FootnotePolicyError.invalid
    }
    return ResolvedFootnotePolicy(mode: mode, heuristicRules: resolvedRules)
  }

  static func resolveLinks(json: String?) throws -> ResolvedReaderLinkPolicy {
    guard let json else { return defaultLinks }
    let value = try JSONSerialization.jsonObject(with: Data(json.utf8))
    return try resolveLinks(value)
  }

  static func resolveLinks(_ value: Any?) throws -> ResolvedReaderLinkPolicy {
    guard let value, !(value is NSNull) else { return defaultLinks }
    let object = try dictionary(value)
    try exactKeys(
      object,
      allowed: ["allowedExternalSchemes", "externalLinks", "unsupportedSchemes"]
    )
    let rawSchemes = object["allowedExternalSchemes"] ?? defaultLinks.allowedExternalSchemes
    guard let schemes = rawSchemes as? [Any], schemes.count <= maximumExternalSchemes else {
      throw FootnotePolicyError.invalid
    }
    let normalizedSchemes = try schemes.map(normalizeScheme)
    guard Set(normalizedSchemes).count == normalizedSchemes.count else {
      throw FootnotePolicyError.invalid
    }
    let externalValue = (object["externalLinks"] as? String) ?? defaultLinks.externalLinks.rawValue
    let unsupportedValue =
      (object["unsupportedSchemes"] as? String) ?? defaultLinks.unsupportedSchemes.rawValue
    guard
      let external = ExternalLinkPolicy(rawValue: externalValue),
      let unsupported = UnsupportedSchemePolicy(rawValue: unsupportedValue)
    else {
      throw FootnotePolicyError.invalid
    }
    return ResolvedReaderLinkPolicy(
      allowedExternalSchemes: normalizedSchemes,
      externalLinks: external,
      unsupportedSchemes: unsupported
    )
  }

  static func decideInternal(
    policy: ResolvedFootnotePolicy,
    href: String,
    semantic: Bool
  ) -> InternalFootnoteDecision {
    if policy.mode == .navigate {
      return InternalFootnoteDecision(decision: "navigate", classification: nil, ruleId: nil)
    }
    if semantic {
      return InternalFootnoteDecision(
        decision: "emit",
        classification: "semantic",
        ruleId: nil
      )
    }
    guard policy.mode == .semanticAndHeuristic else {
      return InternalFootnoteDecision(decision: "navigate", classification: nil, ruleId: nil)
    }
    let parts = hrefParts(href)
    if let rule = policy.heuristicRules.first(where: { matches($0, parts: parts) }) {
      return InternalFootnoteDecision(
        decision: "emit",
        classification: "heuristic",
        ruleId: rule.id
      )
    }
    if conservativeHeuristic(parts) {
      return InternalFootnoteDecision(
        decision: "emit",
        classification: "heuristic",
        ruleId: nil
      )
    }
    return InternalFootnoteDecision(decision: "navigate", classification: nil, ruleId: nil)
  }

  static func decideExternal(
    policy: ResolvedReaderLinkPolicy,
    href: String
  ) -> ExternalReaderLinkDecision {
    let scheme = href.firstIndex(of: ":").flatMap { index -> String? in
      guard index != href.startIndex else { return nil }
      return String(href[..<index]).lowercased()
    }
    if let scheme, policy.allowedExternalSchemes.contains(scheme) {
      return ExternalReaderLinkDecision(
        kind: "external",
        disposition: policy.externalLinks == .intercept ? "intercepted" : "blocked",
        scheme: scheme
      )
    }
    return ExternalReaderLinkDecision(
      kind: "unsupported",
      disposition: policy.unsupportedSchemes == .intercept ? "intercepted" : "blocked",
      scheme: scheme
    )
  }

  private static func resolveRule(_ value: Any) throws -> FootnoteHeuristicRule {
    let object = try dictionary(value)
    try exactKeys(
      object,
      allowed: ["fragmentPrefix", "fragmentSuffix", "id", "resourceSuffix"]
    )
    let id = try matchValue(object["id"])
    let fragmentPrefix = try optionalMatchValue(object["fragmentPrefix"])
    let fragmentSuffix = try optionalMatchValue(object["fragmentSuffix"])
    let resourceSuffix = try optionalMatchValue(object["resourceSuffix"])
    guard fragmentPrefix != nil || fragmentSuffix != nil || resourceSuffix != nil else {
      throw FootnotePolicyError.invalid
    }
    return FootnoteHeuristicRule(
      id: id,
      fragmentPrefix: fragmentPrefix,
      fragmentSuffix: fragmentSuffix,
      resourceSuffix: resourceSuffix
    )
  }

  private static func dictionary(_ value: Any) throws -> [String: Any] {
    guard let object = value as? [String: Any] else { throw FootnotePolicyError.invalid }
    return object
  }

  private static func exactKeys(_ object: [String: Any], allowed: Set<String>) throws {
    guard Set(object.keys).isSubset(of: allowed) else { throw FootnotePolicyError.invalid }
  }

  private static func optionalMatchValue(_ value: Any?) throws -> String? {
    guard let value else { return nil }
    return try matchValue(value)
  }

  private static func matchValue(_ value: Any?) throws -> String {
    guard let value = value as? String else { throw FootnotePolicyError.invalid }
    let result = value.precomposedStringWithCanonicalMapping
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !result.isEmpty,
      result.utf16.count <= maximumMatchValueUTF16Units,
      result.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) })
    else {
      throw FootnotePolicyError.invalid
    }
    return result
  }

  private static func normalizeScheme(_ value: Any) throws -> String {
    guard let value = value as? String else { throw FootnotePolicyError.invalid }
    let scheme = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard
      scheme.range(of: "^[a-z][a-z0-9+.-]{0,31}$", options: .regularExpression) != nil
    else {
      throw FootnotePolicyError.invalid
    }
    return scheme
  }

  private static func hrefParts(_ href: String) -> (fragment: String, resource: String) {
    let components = href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
    let resource = String(components.first ?? "").split(
      separator: "?",
      maxSplits: 1,
      omittingEmptySubsequences: false
    ).first.map(String.init) ?? ""
    return (components.count > 1 ? String(components[1]) : "", resource)
  }

  private static func matches(
    _ rule: FootnoteHeuristicRule,
    parts: (fragment: String, resource: String)
  ) -> Bool {
    (rule.fragmentPrefix == nil || parts.fragment.hasPrefix(rule.fragmentPrefix!))
      && (rule.fragmentSuffix == nil || parts.fragment.hasSuffix(rule.fragmentSuffix!))
      && (rule.resourceSuffix == nil || parts.resource.hasSuffix(rule.resourceSuffix!))
  }

  private static func conservativeHeuristic(
    _ parts: (fragment: String, resource: String)
  ) -> Bool {
    guard !parts.fragment.isEmpty, !parts.resource.isEmpty else { return false }
    let resource = parts.resource.split(separator: "/").last.map(String.init) ?? ""
    return resource.range(
      of: "^(?:foot[-_.]?)?notes?(?:[-_.].*)?$",
      options: .regularExpression
    ) != nil
      && parts.fragment.range(
        of: "^(?:fn|footnote|note)(?:[-_.:]|[0-9])",
        options: [.regularExpression, .caseInsensitive]
      ) != nil
  }

  /// Returns the HTML a footnote link targets. Notes whose id element is
  /// empty, such as `<a id="note"></a><p>text</p>` from page-layout exports,
  /// resolve to the content that immediately follows the anchor.
  static func targetHTML(document: String, fragment: String) -> String {
    let text = document as NSString
    if fragment.isEmpty {
      guard let body = firstMatch("<body\\b[^>]*>", in: text, from: 0),
            let end = firstMatch("</body\\s*>", in: text, from: body.range.upperBound) else {
        return ""
      }
      return text.substring(with: NSRange(
        location: body.range.upperBound,
        length: end.range.location - body.range.upperBound
      ))
    }
    let id = NSRegularExpression.escapedPattern(for: fragment)
    guard
      let opening = firstMatch(
        "<([A-Za-z][A-Za-z0-9:_-]*)\\b[^>]*(?<![\\w:-])id\\s*=\\s*(['\"])\(id)\\2[^>]*?(/?)>",
        in: text,
        from: 0
      )
    else {
      return ""
    }
    var contentStart = opening.range.upperBound
    if text.substring(with: opening.range(at: 3)).isEmpty {
      let tag = NSRegularExpression.escapedPattern(for: text.substring(with: opening.range(at: 1)))
      guard let closing = firstMatch("</\(tag)\\s*>", in: text, from: contentStart) else {
        return ""
      }
      let inner = text.substring(
        with: NSRange(location: contentStart, length: closing.range.location - contentStart)
      )
      if !isBlankHTML(inner) {
        return text.substring(
          with: NSRange(
            location: opening.range.location,
            length: closing.range.upperBound - opening.range.location
          )
        )
      }
      contentStart = closing.range.upperBound
    }
    return followingHTML(in: text, from: contentStart)
  }

  private static let blockTags = "p|div|li|blockquote|aside|section|dl|ol|ul|table|h[1-6]"

  private static func followingHTML(in text: NSString, from start: Int) -> String {
    var position = start
    let gapPattern = "(?:\\s+|<br\\b[^>]*>|<!--.*?-->)+"
    if let gap = anchoredMatch(gapPattern, in: text, at: position) {
      position = gap.range.upperBound
    }
    // An anchor alone in its own block (`<p><a id></a></p>`) points at the next block.
    if let emptyContainer = anchoredMatch("</(?:\(blockTags))\\s*>", in: text, at: position) {
      position = emptyContainer.range.upperBound
      if let gap = anchoredMatch(gapPattern, in: text, at: position) {
        position = gap.range.upperBound
      }
    }
    if let block = anchoredMatch("<(\(blockTags))\\b[^>]*>", in: text, at: position) {
      let tag = text.substring(with: block.range(at: 1))
      guard let closing = firstMatch("</\(tag)\\s*>", in: text, from: block.range.upperBound) else {
        return ""
      }
      return text.substring(
        with: NSRange(location: position, length: closing.range.upperBound - position)
      )
    }
    let boundary = firstMatch(
      "</?(?:\(blockTags)|td|th|dd|body)\\b[^>]*>|<a\\b[^>]*(?<![\\w:-])id\\s*=",
      in: text,
      from: position
    )
    let end = boundary?.range.location ?? text.length
    let inline = text.substring(with: NSRange(location: position, length: end - position))
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return isBlankHTML(inline) ? "" : inline
  }

  private static func isBlankHTML(_ html: String) -> Bool {
    if html.range(of: "<(?:img|svg|image)\\b", options: [.regularExpression, .caseInsensitive]) != nil {
      return false
    }
    return html
      .replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
      .replacingOccurrences(of: "&nbsp;|&#160;", with: "", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{00A0}")))
      .isEmpty
  }

  private static func firstMatch(
    _ pattern: String,
    in text: NSString,
    from location: Int
  ) -> NSTextCheckingResult? {
    try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators])
      .firstMatch(
        in: text as String,
        range: NSRange(location: location, length: text.length - location)
      )
  }

  private static func anchoredMatch(
    _ pattern: String,
    in text: NSString,
    at location: Int
  ) -> NSTextCheckingResult? {
    try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators])
      .firstMatch(
        in: text as String,
        options: .anchored,
        range: NSRange(location: location, length: text.length - location)
      )
  }
}
