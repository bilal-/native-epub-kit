import Foundation

enum ReaderSearchPolicyError: Error, Equatable {
  case invalid(String)
}

struct ResolvedReaderSearchOptions: Equatable, Sendable {
  let caseSensitive: Bool
  let diacriticSensitive: Bool
  let language: String?
  let pageSize: Int

  var jsonObject: [String: Any] {
    var value: [String: Any] = [
      "caseSensitive": caseSensitive,
      "diacriticSensitive": diacriticSensitive,
      "pageSize": pageSize,
    ]
    if let language { value["language"] = language }
    return value
  }
}

struct ResolvedReaderSearchRequest: Equatable, Sendable {
  let options: ResolvedReaderSearchOptions
  let query: String

  var jsonObject: [String: Any] {
    ["options": options.jsonObject, "query": query]
  }
}

struct ResolvedReaderSearchExcerpt: Equatable, Sendable {
  let after: String
  let before: String
  let highlight: String
  let truncated: Bool

  var jsonObject: [String: Any] {
    [
      "after": after,
      "before": before,
      "highlight": highlight,
      "truncated": truncated,
    ]
  }
}

enum ReaderSearchPolicy {
  static let defaultPageSize = 50
  static let maximumPageSize = 100
  static let maximumResults = 2_000
  static let maximumQueryUTF16Units = 256
  static let maximumLanguageUTF16Units = 64
  static let maximumExcerptContextUTF16Units = 256
  static let maximumExcerptHighlightUTF16Units = 256
  static let maximumResourceTitleUTF16Units = 512
  static let maximumSessionIdUTF16Units = 128
  static let maximumCursorUTF16Units = 128
  static let decorationGroups = [
    "current": "search.current:v1",
    "results": "search.results:v1",
  ]
  static let defaultOptions = ResolvedReaderSearchOptions(
    caseSensitive: false,
    diacriticSensitive: false,
    language: nil,
    pageSize: defaultPageSize
  )

  private static let languageExpression = try! NSRegularExpression(
    pattern: "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$"
  )
  private static let identifierExpression = try! NSRegularExpression(
    pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
  )

  static func resolve(query: String, optionsJson: String) throws -> ResolvedReaderSearchRequest {
    let options: Any
    do {
      options = try JSONSerialization.jsonObject(with: Data(optionsJson.utf8))
    } catch {
      throw ReaderSearchPolicyError.invalid("search options are invalid")
    }
    return try resolve(query: query, options: options)
  }

  static func resolve(query: String, options: Any?) throws -> ResolvedReaderSearchRequest {
    let normalizedQuery = query.precomposedStringWithCanonicalMapping
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !normalizedQuery.isEmpty,
      normalizedQuery.utf16.count <= maximumQueryUTF16Units
    else {
      throw ReaderSearchPolicyError.invalid("query is empty or exceeds the bridge bound")
    }

    let object: [String: Any]
    if options == nil || options is NSNull {
      object = [:]
    } else if let value = options as? [String: Any] {
      object = value
    } else {
      throw ReaderSearchPolicyError.invalid("search options must be an object")
    }
    let supported = Set(["caseSensitive", "diacriticSensitive", "language", "pageSize"])
    guard object.keys.allSatisfy(supported.contains) else {
      throw ReaderSearchPolicyError.invalid("search options contain an unsupported field")
    }

    let caseSensitive = try boolean(
      object["caseSensitive"],
      fallback: defaultOptions.caseSensitive
    )
    let diacriticSensitive = try boolean(
      object["diacriticSensitive"],
      fallback: defaultOptions.diacriticSensitive
    )
    let pageSize = try integer(object["pageSize"], fallback: defaultPageSize)
    guard 1 ... maximumPageSize ~= pageSize else {
      throw ReaderSearchPolicyError.invalid("page size is outside the supported range")
    }

    var language: String?
    if let rawLanguage = object["language"] {
      guard let value = rawLanguage as? String else {
        throw ReaderSearchPolicyError.invalid("language must be a string")
      }
      let normalized = value.precomposedStringWithCanonicalMapping
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard
        !normalized.isEmpty,
        normalized.utf16.count <= maximumLanguageUTF16Units,
        matches(languageExpression, normalized)
      else {
        throw ReaderSearchPolicyError.invalid("language is not a bounded BCP 47 tag")
      }
      language = normalized
    }

    return ResolvedReaderSearchRequest(
      options: ResolvedReaderSearchOptions(
        caseSensitive: caseSensitive,
        diacriticSensitive: diacriticSensitive,
        language: language,
        pageSize: pageSize
      ),
      query: normalizedQuery
    )
  }

  static func excerpt(before: String, highlight: String, after: String)
    -> ResolvedReaderSearchExcerpt
  {
    let boundedBefore = SelectionTextBounder.boundEnd(
      before,
      maximumUTF16Units: maximumExcerptContextUTF16Units
    )
    let boundedHighlight = SelectionTextBounder.bound(
      highlight,
      maximumUTF16Units: maximumExcerptHighlightUTF16Units
    )
    let boundedAfter = SelectionTextBounder.bound(
      after,
      maximumUTF16Units: maximumExcerptContextUTF16Units
    )
    return ResolvedReaderSearchExcerpt(
      after: boundedAfter.text,
      before: boundedBefore.text,
      highlight: boundedHighlight.text,
      truncated: boundedBefore.truncated || boundedHighlight.truncated || boundedAfter.truncated
    )
  }

  static func resourceTitle(_ value: String?) -> String? {
    guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
          !normalized.isEmpty
    else { return nil }
    return SelectionTextBounder.bound(
      normalized,
      maximumUTF16Units: maximumResourceTitleUTF16Units
    ).text
  }

  static func validateSessionId(_ value: String) throws -> String {
    try validateIdentifier(value, maximumUTF16Units: maximumSessionIdUTF16Units)
  }

  static func validateCursor(_ value: String, allowInitialEmpty: Bool = false) throws -> String {
    if allowInitialEmpty, value.isEmpty { return value }
    return try validateIdentifier(value, maximumUTF16Units: maximumCursorUTF16Units)
  }

  private static func validateIdentifier(_ value: String, maximumUTF16Units: Int) throws -> String {
    guard
      !value.isEmpty,
      value.utf16.count <= maximumUTF16Units,
      matches(identifierExpression, value)
    else {
      throw ReaderSearchPolicyError.invalid("opaque identifier is invalid")
    }
    return value
  }

  private static func boolean(_ value: Any?, fallback: Bool) throws -> Bool {
    guard let value else { return fallback }
    guard let boolean = value as? Bool else {
      throw ReaderSearchPolicyError.invalid("search boolean option is invalid")
    }
    return boolean
  }

  private static func integer(_ value: Any?, fallback: Int) throws -> Int {
    guard let value else { return fallback }
    guard let number = value as? NSNumber,
          CFGetTypeID(number) != CFBooleanGetTypeID()
    else {
      throw ReaderSearchPolicyError.invalid("search integer option is invalid")
    }
    let double = number.doubleValue
    guard double.isFinite, double.rounded() == double, let integer = Int(exactly: double) else {
      throw ReaderSearchPolicyError.invalid("search integer option is invalid")
    }
    return integer
  }

  private static func matches(_ expression: NSRegularExpression, _ value: String) -> Bool {
    expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))?.range
      == NSRange(value.startIndex..., in: value)
  }
}
