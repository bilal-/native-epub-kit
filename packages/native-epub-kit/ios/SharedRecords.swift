import Foundation

enum SharedJSONValue: Codable, Equatable, Sendable {
  case null
  case boolean(Bool)
  case integer(Int64)
  case number(Double)
  case string(String)
  case array([SharedJSONValue])
  case object([String: SharedJSONValue])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .boolean(value)
    } else if let value = try? container.decode(Int64.self) {
      self = .integer(value)
    } else if let value = try? container.decode(Double.self) {
      guard value.isFinite else {
        throw DecodingError.dataCorruptedError(
          in: container,
          debugDescription: "JSON numbers must be finite"
        )
      }
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([SharedJSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: SharedJSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Unsupported JSON value"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null:
      try container.encodeNil()
    case let .boolean(value):
      try container.encode(value)
    case let .integer(value):
      try container.encode(value)
    case let .number(value):
      try container.encode(value)
    case let .string(value):
      try container.encode(value)
    case let .array(value):
      try container.encode(value)
    case let .object(value):
      try container.encode(value)
    }
  }
}

struct SharedRecordValidationError: Error, Equatable, CustomStringConvertible {
  let path: String
  let reason: String

  var description: String { "\(path): \(reason)" }
}

enum SharedPublicationSourceKind: String, CaseIterable, Codable, Sendable {
  case file
  case content
  case remote
}

enum SharedReadingProgression: String, CaseIterable, Codable, Sendable {
  case ltr
  case rtl
  case ttb
  case btt
  case auto
}

enum SharedPublicationLayout: String, CaseIterable, Codable, Sendable {
  case reflowable
  case fixed
}

enum SharedProgressPrecision: String, CaseIterable, Codable, Sendable {
  case continuous
  case position
  case resource
}

enum SharedNavigationUnitSource: String, CaseIterable, Codable, Sendable {
  case toc
  case readingOrderFallback = "reading-order-fallback"
}

enum SharedReaderLocationReason: String, CaseIterable, Codable, Sendable {
  case initial
  case userScroll = "user-scroll"
  case userPageTurn = "user-page-turn"
  case programmatic
  case preferenceChange = "preference-change"
  case restored
}

enum SharedReaderSelectionChangeReason: String, CaseIterable, Codable, Sendable {
  case started
  case changed
  case cleared
  case dismissed
}

enum SharedTextDirection: String, CaseIterable, Codable, Sendable {
  case ltr
  case rtl
  case auto
}

enum SharedDecorationStyleType: String, CaseIterable, Codable, Sendable {
  case highlight
  case underline
  case marginIcon = "margin-icon"
  case custom
}

enum SharedFootnoteClassification: String, CaseIterable, Codable, Sendable {
  case semantic
  case heuristic
}

enum SharedReaderLinkKind: String, CaseIterable, Codable, Sendable {
  case `internal`
  case external
  case unsupported
}

enum SharedReaderLinkDisposition: String, CaseIterable, Codable, Sendable {
  case followed
  case intercepted
  case blocked
}

enum SharedReaderImageSourceKind: String, CaseIterable, Codable, Sendable {
  case publicationResource = "publication-resource"
  case inlineSVG = "inline-svg"
  case external
}

enum SharedReaderImageUnresolvedReason: String, CaseIterable, Codable, Sendable {
  case externalResource = "external-resource"
  case resourceNotFound = "resource-not-found"
  case sourceTooLarge = "source-too-large"
  case unsupportedSource = "unsupported-source"
}

enum SharedNativePlatform: String, CaseIterable, Codable, Sendable {
  case ios
  case android
}

enum SharedReaderErrorCode: String, CaseIterable, Codable, Sendable {
  case sourceNotFound = "SOURCE_NOT_FOUND"
  case sourcePermissionDenied = "SOURCE_PERMISSION_DENIED"
  case unsupportedFormat = "UNSUPPORTED_FORMAT"
  case publicationOpenFailed = "PUBLICATION_OPEN_FAILED"
  case publicationProtected = "PUBLICATION_PROTECTED"
  case navigatorCreationFailed = "NAVIGATOR_CREATION_FAILED"
  case resourceLoadFailed = "RESOURCE_LOAD_FAILED"
  case invalidLocator = "INVALID_LOCATOR"
  case navigationFailed = "NAVIGATION_FAILED"
  case searchFailed = "SEARCH_FAILED"
  case readerNotReady = "READER_NOT_READY"
  case readerDestroyed = "READER_DESTROYED"
  case typographyConfigurationFailed = "TYPOGRAPHY_CONFIGURATION_FAILED"
  case nativeInvariantViolation = "NATIVE_INVARIANT_VIOLATION"
}

enum SharedReaderErrorPhase: String, CaseIterable, Codable, Sendable {
  case source
  case open
  case render
  case navigate
  case search
  case resource
  case close
}

enum SharedCoreRecordType: String, CaseIterable, Codable, Sendable {
  case publicationSource
  case locator
  case readerGeometry
  case publicationSummary
  case navigationUnit
  case readerLocationEvent
  case readerSelection
  case readerSelectionChangeEvent
  case readerSelectionActionEvent
  case readerDecoration
  case readerDecorationActivationEvent
  case footnoteEvent
  case readerLinkEvent
  case readerImageActivationEvent
  case readerError
}

enum SharedCoreRecordContract {
  static let enumValues: [String: [String]] = [
    "publicationSourceKind": SharedPublicationSourceKind.allCases.map(\.rawValue),
    "readingProgression": SharedReadingProgression.allCases.map(\.rawValue),
    "publicationLayout": SharedPublicationLayout.allCases.map(\.rawValue),
    "progressPrecision": SharedProgressPrecision.allCases.map(\.rawValue),
    "navigationUnitSource": SharedNavigationUnitSource.allCases.map(\.rawValue),
    "readerLocationReason": SharedReaderLocationReason.allCases.map(\.rawValue),
    "readerSelectionChangeReason": SharedReaderSelectionChangeReason.allCases.map(\.rawValue),
    "textDirection": SharedTextDirection.allCases.map(\.rawValue),
    "decorationStyle": SharedDecorationStyleType.allCases.map(\.rawValue),
    "footnoteClassification": SharedFootnoteClassification.allCases.map(\.rawValue),
    "readerLinkKind": SharedReaderLinkKind.allCases.map(\.rawValue),
    "readerLinkDisposition": SharedReaderLinkDisposition.allCases.map(\.rawValue),
    "readerImageSourceKind": SharedReaderImageSourceKind.allCases.map(\.rawValue),
    "readerImageUnresolvedReason": SharedReaderImageUnresolvedReason.allCases.map(\.rawValue),
    "platform": SharedNativePlatform.allCases.map(\.rawValue),
    "readerErrorCode": SharedReaderErrorCode.allCases.map(\.rawValue),
    "readerErrorPhase": SharedReaderErrorPhase.allCases.map(\.rawValue),
  ]

  static let units = [
    "geometry": "logical-points-ios-density-independent-pixels-android",
    "progression": "closed-zero-to-one",
    "position": "one-based-positive-integer",
    "generation": "zero-based-safe-integer",
    "sequence": "zero-based-safe-integer",
  ]

  static let nullability = [
    "optionalFields": "omitted",
    "locatorTitle": "string-or-null",
    "jsonExtensionValues": "may-be-null",
  ]
}

private enum SharedRecordValidator {
  typealias Object = [String: SharedJSONValue]

  static func object(_ value: SharedJSONValue, path: String) throws -> Object {
    guard case let .object(object) = value else {
      throw SharedRecordValidationError(path: path, reason: "must be an object")
    }
    return object
  }

  static func required(_ object: Object, _ key: String, path: String) throws -> SharedJSONValue {
    guard let value = object[key] else {
      throw SharedRecordValidationError(path: "\(path)/\(key)", reason: "is required")
    }
    return value
  }

  static func string(
    _ value: SharedJSONValue,
    path: String,
    allowEmpty: Bool = false
  ) throws -> String {
    guard case let .string(value) = value, allowEmpty || !value.isEmpty else {
      throw SharedRecordValidationError(
        path: path,
        reason: allowEmpty ? "must be a string" : "must be a non-empty string"
      )
    }
    return value
  }

  static func boolean(_ value: SharedJSONValue, path: String) throws -> Bool {
    guard case let .boolean(value) = value else {
      throw SharedRecordValidationError(path: path, reason: "must be a boolean")
    }
    return value
  }

  static func number(_ value: SharedJSONValue, path: String) throws -> Double {
    let number: Double
    switch value {
    case let .integer(value):
      number = Double(value)
    case let .number(value):
      number = value
    default:
      throw SharedRecordValidationError(path: path, reason: "must be a finite number")
    }
    guard number.isFinite else {
      throw SharedRecordValidationError(path: path, reason: "must be a finite number")
    }
    return number
  }

  static func integer(
    _ value: SharedJSONValue,
    path: String,
    minimum: Int64 = 0
  ) throws -> Int64 {
    let integer: Int64
    switch value {
    case let .integer(value):
      integer = value
    case let .number(value)
      where value.isFinite && value.rounded(.towardZero) == value
        && value >= Double(Int64.min) && value <= Double(Int64.max):
      integer = Int64(value)
    default:
      throw SharedRecordValidationError(
        path: path,
        reason: "must be an integer >= \(minimum)"
      )
    }
    guard integer >= minimum, integer <= 9_007_199_254_740_991 else {
      throw SharedRecordValidationError(
        path: path,
        reason: "must be a safe integer >= \(minimum)"
      )
    }
    return integer
  }

  static func progression(_ value: SharedJSONValue, path: String) throws -> Double {
    let value = try number(value, path: path)
    guard (0...1).contains(value) else {
      throw SharedRecordValidationError(path: path, reason: "must be within 0...1")
    }
    return value
  }

  static func array(_ value: SharedJSONValue, path: String) throws -> [SharedJSONValue] {
    guard case let .array(values) = value else {
      throw SharedRecordValidationError(path: path, reason: "must be an array")
    }
    return values
  }

  static func stringArray(_ value: SharedJSONValue, path: String) throws -> [String] {
    try array(value, path: path).enumerated().map { index, value in
      try string(value, path: "\(path)/\(index)")
    }
  }

  static func enumString(
    _ value: SharedJSONValue,
    allowed: Set<String>,
    path: String
  ) throws -> String {
    let value = try string(value, path: path)
    guard allowed.contains(value) else {
      throw SharedRecordValidationError(
        path: path,
        reason: "has unsupported value \(value)"
      )
    }
    return value
  }

  static func optionalString(_ object: Object, _ key: String, path: String) throws {
    if let value = object[key] {
      _ = try string(value, path: "\(path)/\(key)")
    }
  }

  static func optionalBoolean(_ object: Object, _ key: String, path: String) throws {
    if let value = object[key] {
      _ = try boolean(value, path: "\(path)/\(key)")
    }
  }

  static func optionalProgression(_ object: Object, _ key: String, path: String) throws {
    if let value = object[key] {
      _ = try progression(value, path: "\(path)/\(key)")
    }
  }

  static func optionalPositiveInteger(_ object: Object, _ key: String, path: String) throws {
    if let value = object[key] {
      _ = try integer(value, path: "\(path)/\(key)", minimum: 1)
    }
  }

  static func validatePublicationSource(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    let kind = try enumString(
      required(object, "kind", path: path),
      allowed: Set(SharedPublicationSourceKind.allCases.map(\.rawValue)),
      path: "\(path)/kind"
    )
    if kind == SharedPublicationSourceKind.remote.rawValue {
      _ = try string(required(object, "url", path: path), path: "\(path)/url")
      if let headers = object["headers"] {
        for (key, value) in try self.object(headers, path: "\(path)/headers") {
          _ = try string(value, path: "\(path)/headers/\(key)", allowEmpty: true)
        }
      }
    } else {
      _ = try string(required(object, "uri", path: path), path: "\(path)/uri")
    }
  }

  static func validateLocator(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "href", path: path), path: "\(path)/href")
    _ = try string(required(object, "type", path: path), path: "\(path)/type")
    if let title = object["title"], title != .null {
      _ = try string(title, path: "\(path)/title", allowEmpty: true)
    }
    if let value = object["locations"] {
      let locations = try self.object(value, path: "\(path)/locations")
      if let fragments = locations["fragments"] {
        _ = try stringArray(fragments, path: "\(path)/locations/fragments")
      }
      try optionalProgression(locations, "progression", path: "\(path)/locations")
      try optionalProgression(locations, "totalProgression", path: "\(path)/locations")
      try optionalPositiveInteger(locations, "position", path: "\(path)/locations")
    }
    if let value = object["text"] {
      let text = try self.object(value, path: "\(path)/text")
      try optionalString(text, "before", path: "\(path)/text")
      try optionalString(text, "highlight", path: "\(path)/text")
      try optionalString(text, "after", path: "\(path)/text")
    }
  }

  static func validateRect(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try number(required(object, "x", path: path), path: "\(path)/x")
    _ = try number(required(object, "y", path: path), path: "\(path)/y")
    let width = try number(required(object, "width", path: path), path: "\(path)/width")
    let height = try number(required(object, "height", path: path), path: "\(path)/height")
    guard width >= 0 else {
      throw SharedRecordValidationError(path: "\(path)/width", reason: "must be >= 0")
    }
    guard height >= 0 else {
      throw SharedRecordValidationError(path: "\(path)/height", reason: "must be >= 0")
    }
  }

  static func validateGeometry(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    let coordinateSpace = try string(
      required(object, "coordinateSpace", path: path),
      path: "\(path)/coordinateSpace"
    )
    guard coordinateSpace == "reader-view-and-window-v1" else {
      throw SharedRecordValidationError(
        path: "\(path)/coordinateSpace",
        reason: "must be reader-view-and-window-v1"
      )
    }
    let viewport = try self.object(
      required(object, "viewport", path: path),
      path: "\(path)/viewport"
    )
    let width = try number(
      required(viewport, "width", path: "\(path)/viewport"),
      path: "\(path)/viewport/width"
    )
    let height = try number(
      required(viewport, "height", path: "\(path)/viewport"),
      path: "\(path)/viewport/height"
    )
    guard width > 0, height > 0 else {
      throw SharedRecordValidationError(
        path: "\(path)/viewport",
        reason: "width and height must be > 0"
      )
    }
    if let rect = object["viewRect"] {
      try validateRect(rect, path: "\(path)/viewRect")
    }
    if let rect = object["visibleViewRect"] {
      try validateRect(rect, path: "\(path)/visibleViewRect")
    }
    if let rect = object["windowRect"] {
      try validateRect(rect, path: "\(path)/windowRect")
    }
    if let rect = object["visibleWindowRect"] {
      try validateRect(rect, path: "\(path)/visibleWindowRect")
    }
  }

  static func validateContributor(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "name", path: path), path: "\(path)/name")
    try optionalString(object, "identifier", path: path)
    try optionalString(object, "sortAs", path: path)
    if let roles = object["roles"] {
      _ = try stringArray(roles, path: "\(path)/roles")
    }
  }

  static func validateLink(
    _ value: SharedJSONValue,
    path: String,
    depth: Int = 0
  ) throws {
    guard depth <= 256 else {
      throw SharedRecordValidationError(path: path, reason: "link nesting exceeds 256 levels")
    }
    let object = try object(value, path: path)
    _ = try string(required(object, "href", path: path), path: "\(path)/href")
    try optionalString(object, "title", path: path)
    try optionalString(object, "type", path: path)
    if let rel = object["rel"] {
      _ = try stringArray(rel, path: "\(path)/rel")
    }
    if let properties = object["properties"] {
      _ = try self.object(properties, path: "\(path)/properties")
    }
    for (index, child) in try array(
      required(object, "children", path: path),
      path: "\(path)/children"
    ).enumerated() {
      try validateLink(child, path: "\(path)/children/\(index)", depth: depth + 1)
    }
  }

  static func validateCapabilities(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    for key in ["customFonts", "decorations", "footnotes", "images", "search", "selection"] {
      _ = try boolean(required(object, key, path: path), path: "\(path)/\(key)")
    }
    _ = try enumString(
      required(object, "progressPrecision", path: path),
      allowed: Set(SharedProgressPrecision.allCases.map(\.rawValue)),
      path: "\(path)/progressPrecision"
    )
    _ = try stringArray(required(object, "warnings", path: path), path: "\(path)/warnings")
  }

  static func validatePublicationSummary(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "title", path: path), path: "\(path)/title")
    try optionalString(object, "identifier", path: path)
    try optionalString(object, "subtitle", path: path)
    if let progression = object["readingProgression"] {
      _ = try enumString(
        progression,
        allowed: Set(SharedReadingProgression.allCases.map(\.rawValue)),
        path: "\(path)/readingProgression"
      )
    }
    _ = try enumString(
      required(object, "layout", path: path),
      allowed: Set(SharedPublicationLayout.allCases.map(\.rawValue)),
      path: "\(path)/layout"
    )
    _ = try stringArray(required(object, "languages", path: path), path: "\(path)/languages")
    for (index, author) in try array(
      required(object, "authors", path: path),
      path: "\(path)/authors"
    ).enumerated() {
      try validateContributor(author, path: "\(path)/authors/\(index)")
    }
    for key in ["tableOfContents", "readingOrder"] {
      for (index, link) in try array(
        required(object, key, path: path),
        path: "\(path)/\(key)"
      ).enumerated() {
        try validateLink(link, path: "\(path)/\(key)/\(index)")
      }
    }
    for (index, locator) in try array(
      required(object, "positions", path: path),
      path: "\(path)/positions"
    ).enumerated() {
      try validateLocator(locator, path: "\(path)/positions/\(index)")
    }
    try validateCapabilities(
      required(object, "capabilities", path: path),
      path: "\(path)/capabilities"
    )
  }

  static func validateNavigationUnit(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    for key in ["id", "title", "href"] {
      _ = try string(required(object, key, path: path), path: "\(path)/\(key)")
    }
    _ = try integer(required(object, "depth", path: path), path: "\(path)/depth")
    _ = try enumString(
      required(object, "source", path: path),
      allowed: Set(SharedNavigationUnitSource.allCases.map(\.rawValue)),
      path: "\(path)/source"
    )
    _ = try stringArray(required(object, "childIds", path: path), path: "\(path)/childIds")
    try optionalString(object, "parentId", path: path)
    try validateLocator(
      required(object, "startLocator", path: path),
      path: "\(path)/startLocator"
    )
    if let end = object["endLocator"] {
      try validateLocator(end, path: "\(path)/endLocator")
    }
    try optionalPositiveInteger(object, "startPosition", path: path)
    try optionalPositiveInteger(object, "endPositionExclusive", path: path)
    try optionalProgression(object, "startTotalProgression", path: path)
    try optionalProgression(object, "endTotalProgression", path: path)
    if let start = object["startPosition"], let end = object["endPositionExclusive"] {
      let startValue = try integer(start, path: "\(path)/startPosition", minimum: 1)
      let endValue = try integer(end, path: "\(path)/endPositionExclusive", minimum: 1)
      guard endValue > startValue else {
        throw SharedRecordValidationError(
          path: "\(path)/endPositionExclusive",
          reason: "must be greater than startPosition"
        )
      }
    }
  }

  static func validateLocationEvent(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try integer(required(object, "sequence", path: path), path: "\(path)/sequence")
    try validateLocator(required(object, "locator", path: path), path: "\(path)/locator")
    _ = try enumString(
      required(object, "reason", path: path),
      allowed: Set(SharedReaderLocationReason.allCases.map(\.rawValue)),
      path: "\(path)/reason"
    )
    _ = try enumString(
      required(object, "precision", path: path),
      allowed: Set(SharedProgressPrecision.allCases.map(\.rawValue)),
      path: "\(path)/precision"
    )
    try optionalProgression(object, "chapterProgress", path: path)
    try optionalProgression(object, "overallProgress", path: path)
    try optionalPositiveInteger(object, "position", path: path)
    try optionalPositiveInteger(object, "totalPositions", path: path)
    if let unit = object["navigationUnit"] {
      try validateNavigationUnit(unit, path: "\(path)/navigationUnit")
    }
    if let visibleRange = object["visibleRange"] {
      let range = try self.object(visibleRange, path: "\(path)/visibleRange")
      try validateLocator(
        required(range, "start", path: "\(path)/visibleRange"),
        path: "\(path)/visibleRange/start"
      )
      try validateLocator(
        required(range, "end", path: "\(path)/visibleRange"),
        path: "\(path)/visibleRange/end"
      )
    }
  }

  static func validateSelection(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    try validateLocator(required(object, "locator", path: path), path: "\(path)/locator")
    _ = try string(
      required(object, "text", path: path),
      path: "\(path)/text",
      allowEmpty: true
    )
    try optionalString(object, "language", path: path)
    try optionalString(object, "navigationUnitId", path: path)
    try optionalBoolean(object, "copyAllowed", path: path)
    try optionalBoolean(object, "truncated", path: path)
    if let direction = object["direction"] {
      _ = try enumString(
        direction,
        allowed: Set(SharedTextDirection.allCases.map(\.rawValue)),
        path: "\(path)/direction"
      )
    }
    if let geometry = object["geometry"] {
      try validateGeometry(geometry, path: "\(path)/geometry")
    }
  }

  static func validateSelectionSnapshot(_ value: SharedJSONValue, path: String) throws {
    try validateSelection(value, path: path)
    let object = try object(value, path: path)
    _ = try boolean(required(object, "copyAllowed", path: path), path: "\(path)/copyAllowed")
    _ = try boolean(required(object, "truncated", path: path), path: "\(path)/truncated")
  }

  static func validateSelectionIdentity(_ object: Object, path: String) throws {
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try integer(required(object, "sequence", path: path), path: "\(path)/sequence")
    _ = try boolean(required(object, "handlesActive", path: path), path: "\(path)/handlesActive")
    _ = try enumString(
      required(object, "platform", path: path),
      allowed: Set(SharedNativePlatform.allCases.map(\.rawValue)),
      path: "\(path)/platform"
    )
  }

  static func validateSelectionChangeEvent(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    try validateSelectionIdentity(object, path: path)
    let reason = try enumString(
      required(object, "reason", path: path),
      allowed: Set(SharedReaderSelectionChangeReason.allCases.map(\.rawValue)),
      path: "\(path)/reason"
    )
    let selection = try required(object, "selection", path: path)
    let ended = reason == SharedReaderSelectionChangeReason.cleared.rawValue
      || reason == SharedReaderSelectionChangeReason.dismissed.rawValue
    if ended {
      guard selection == .null else {
        throw SharedRecordValidationError(
          path: "\(path)/selection",
          reason: "must be null when reason is \(reason)"
        )
      }
      guard try boolean(
        required(object, "handlesActive", path: path),
        path: "\(path)/handlesActive"
      ) == false else {
        throw SharedRecordValidationError(
          path: "\(path)/handlesActive",
          reason: "must be false when reason is \(reason)"
        )
      }
    } else {
      guard selection != .null else {
        throw SharedRecordValidationError(
          path: "\(path)/selection",
          reason: "must be active when reason is \(reason)"
        )
      }
      try validateSelectionSnapshot(selection, path: "\(path)/selection")
    }
  }

  static func validateSelectionActionEvent(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    try validateSelectionIdentity(object, path: path)
    _ = try string(required(object, "actionId", path: path), path: "\(path)/actionId")
    try validateSelectionSnapshot(
      required(object, "selection", path: path),
      path: "\(path)/selection"
    )
  }

  static func validateDecoration(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "id", path: path), path: "\(path)/id")
    try validateLocator(required(object, "locator", path: path), path: "\(path)/locator")
    let style = try self.object(required(object, "style", path: path), path: "\(path)/style")
    let type = try enumString(
      required(style, "type", path: "\(path)/style"),
      allowed: Set(SharedDecorationStyleType.allCases.map(\.rawValue)),
      path: "\(path)/style/type"
    )
    if type == "highlight" || type == "underline" {
      _ = try string(
        required(style, "tint", path: "\(path)/style"),
        path: "\(path)/style/tint"
      )
    }
    if (type == "highlight" || type == "underline"), let active = style["isActive"] {
      _ = try boolean(active, path: "\(path)/style/isActive")
    }
    if type == "margin-icon" {
      _ = try string(
        required(style, "asset", path: "\(path)/style"),
        path: "\(path)/style/asset"
      )
      try optionalString(style, "tint", path: "\(path)/style")
    }
    if type == "custom" {
      _ = try string(
        required(style, "template", path: "\(path)/style"),
        path: "\(path)/style/template"
      )
    }
  }

  static func validateDecorationActivationEvent(
    _ value: SharedJSONValue,
    path: String
  ) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try integer(required(object, "sequence", path: path), path: "\(path)/sequence")
    _ = try enumString(
      required(object, "platform", path: path),
      allowed: Set(SharedNativePlatform.allCases.map(\.rawValue)),
      path: "\(path)/platform"
    )
    _ = try string(required(object, "group", path: path), path: "\(path)/group")
    try validateDecoration(
      required(object, "decoration", path: path),
      path: "\(path)/decoration"
    )
    if let geometry = object["geometry"] {
      try validateGeometry(geometry, path: "\(path)/geometry")
    }
  }

  static func validateFootnote(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try enumString(
      required(object, "platform", path: path),
      allowed: Set(SharedNativePlatform.allCases.map(\.rawValue)),
      path: "\(path)/platform"
    )
    _ = try string(required(object, "href", path: path), path: "\(path)/href")
    _ = try string(required(object, "text", path: path), path: "\(path)/text", allowEmpty: true)
    _ = try boolean(required(object, "truncated", path: path), path: "\(path)/truncated")
    _ = try enumString(
      required(object, "classification", path: path),
      allowed: Set(SharedFootnoteClassification.allCases.map(\.rawValue)),
      path: "\(path)/classification"
    )
    try validateLocator(
      required(object, "sourceLocator", path: path),
      path: "\(path)/sourceLocator"
    )
    if let target = object["targetLocator"] {
      try validateLocator(target, path: "\(path)/targetLocator")
    }
    for key in ["id", "referrer", "contentType", "html", "language"] {
      try optionalString(object, key, path: path)
    }
    if let direction = object["direction"] {
      _ = try enumString(
        direction,
        allowed: Set(SharedTextDirection.allCases.map(\.rawValue)),
        path: "\(path)/direction"
      )
    }
    if let geometry = object["geometry"] {
      try validateGeometry(geometry, path: "\(path)/geometry")
    }
  }

  static func validateReaderLink(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try enumString(
      required(object, "platform", path: path),
      allowed: Set(SharedNativePlatform.allCases.map(\.rawValue)),
      path: "\(path)/platform"
    )
    _ = try string(required(object, "href", path: path), path: "\(path)/href")
    _ = try enumString(
      required(object, "kind", path: path),
      allowed: Set(SharedReaderLinkKind.allCases.map(\.rawValue)),
      path: "\(path)/kind"
    )
    _ = try enumString(
      required(object, "disposition", path: path),
      allowed: Set(SharedReaderLinkDisposition.allCases.map(\.rawValue)),
      path: "\(path)/disposition"
    )
    try validateLocator(
      required(object, "sourceLocator", path: path),
      path: "\(path)/sourceLocator"
    )
    if let target = object["targetLocator"] {
      try validateLocator(target, path: "\(path)/targetLocator")
    }
    for key in ["contentType", "referrer", "scheme"] {
      try optionalString(object, key, path: path)
    }
    if let geometry = object["geometry"] {
      try validateGeometry(geometry, path: "\(path)/geometry")
    }
  }

  static func validateReaderImageActivation(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try string(required(object, "instanceId", path: path), path: "\(path)/instanceId")
    _ = try integer(required(object, "generation", path: path), path: "\(path)/generation")
    _ = try integer(required(object, "sequence", path: path), path: "\(path)/sequence")
    _ = try enumString(
      required(object, "platform", path: path),
      allowed: Set(SharedNativePlatform.allCases.map(\.rawValue)),
      path: "\(path)/platform"
    )
    try validateLocator(required(object, "locator", path: path), path: "\(path)/locator")

    for key in ["alt", "caption"] {
      if let raw = object[key] {
        let value = try string(raw, path: "\(path)/\(key)", allowEmpty: true)
        guard value.utf16.count <= 4_096 else {
          throw SharedRecordValidationError(
            path: "\(path)/\(key)",
            reason: "must contain at most 4096 UTF-16 units"
          )
        }
      }
    }

    let sourcePath = "\(path)/source"
    let source = try self.object(required(object, "source", path: path), path: sourcePath)
    let kind = try enumString(
      required(source, "kind", path: sourcePath),
      allowed: Set(SharedReaderImageSourceKind.allCases.map(\.rawValue)),
      path: "\(sourcePath)/kind"
    )
    let resolvable = try boolean(
      required(source, "resolvable", path: sourcePath),
      path: "\(sourcePath)/resolvable"
    )
    let href = try source["href"].map {
      try string($0, path: "\(sourcePath)/href")
    }
    let handle = try source["handle"].map {
      try string($0, path: "\(sourcePath)/handle")
    }
    if let href, href.utf16.count > 4_096 {
      throw SharedRecordValidationError(
        path: "\(sourcePath)/href",
        reason: "must contain 1-4096 UTF-16 units"
      )
    }
    if let handle, handle.utf16.count > 128 {
      throw SharedRecordValidationError(
        path: "\(sourcePath)/handle",
        reason: "must contain 1-128 UTF-16 units"
      )
    }
    if let contentTypeValue = source["contentType"] {
      let contentType = try string(contentTypeValue, path: "\(sourcePath)/contentType")
        .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard contentType.hasPrefix("image/"), contentType.utf16.count <= 128 else {
        throw SharedRecordValidationError(
          path: "\(sourcePath)/contentType",
          reason: "must be a bounded image media type"
        )
      }
    }
    let reason = try source["unresolvedReason"].map {
      try enumString(
        $0,
        allowed: Set(SharedReaderImageUnresolvedReason.allCases.map(\.rawValue)),
        path: "\(sourcePath)/unresolvedReason"
      )
    }
    if resolvable {
      guard handle != nil else {
        throw SharedRecordValidationError(
          path: "\(sourcePath)/handle",
          reason: "is required for a resolvable source"
        )
      }
      guard reason == nil else {
        throw SharedRecordValidationError(
          path: "\(sourcePath)/unresolvedReason",
          reason: "must be omitted when resolvable"
        )
      }
    } else {
      guard handle == nil else {
        throw SharedRecordValidationError(
          path: "\(sourcePath)/handle",
          reason: "must be omitted when unresolved"
        )
      }
      guard reason != nil else {
        throw SharedRecordValidationError(
          path: "\(sourcePath)/unresolvedReason",
          reason: "is required when unresolved"
        )
      }
    }
    if kind == SharedReaderImageSourceKind.publicationResource.rawValue, href == nil {
      throw SharedRecordValidationError(
        path: "\(sourcePath)/href",
        reason: "is required for a publication resource"
      )
    }
    if kind == SharedReaderImageSourceKind.inlineSVG.rawValue, href != nil {
      throw SharedRecordValidationError(
        path: "\(sourcePath)/href",
        reason: "must be omitted for inline SVG"
      )
    }
    if kind == SharedReaderImageSourceKind.external.rawValue,
       (href == nil || resolvable || reason != SharedReaderImageUnresolvedReason.externalResource.rawValue)
    {
      throw SharedRecordValidationError(
        path: sourcePath,
        reason: "external sources must be unresolved with reason external-resource"
      )
    }

    let rightsPath = "\(path)/rights"
    let rights = try self.object(required(object, "rights", path: path), path: rightsPath)
    _ = try boolean(required(rights, "canShare", path: rightsPath), path: "\(rightsPath)/canShare")
    _ = try boolean(required(rights, "canZoom", path: rightsPath), path: "\(rightsPath)/canZoom")
    if let geometry = object["geometry"] {
      try validateGeometry(geometry, path: "\(path)/geometry")
    }
  }

  static func validateReaderError(_ value: SharedJSONValue, path: String) throws {
    let object = try object(value, path: path)
    _ = try enumString(
      required(object, "code", path: path),
      allowed: Set(SharedReaderErrorCode.allCases.map(\.rawValue)),
      path: "\(path)/code"
    )
    _ = try enumString(
      required(object, "phase", path: path),
      allowed: Set(SharedReaderErrorPhase.allCases.map(\.rawValue)),
      path: "\(path)/phase"
    )
    _ = try string(required(object, "message", path: path), path: "\(path)/message")
    _ = try boolean(required(object, "recoverable", path: path), path: "\(path)/recoverable")
    try optionalString(object, "publicationUri", path: path)
  }
}

protocol SharedJSONBackedRecord: Equatable, Sendable {
  var jsonValue: SharedJSONValue { get }
  init(validating jsonValue: SharedJSONValue) throws
}

struct SharedPublicationSourceRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  let kind: SharedPublicationSourceKind

  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validatePublicationSource(jsonValue, path: "$")
    let object = try SharedRecordValidator.object(jsonValue, path: "$")
    let rawKind = try SharedRecordValidator.string(
      SharedRecordValidator.required(object, "kind", path: "$"),
      path: "$/kind"
    )
    kind = SharedPublicationSourceKind(rawValue: rawKind)!
    self.jsonValue = jsonValue
  }
}

struct SharedLocatorRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  let href: String
  let type: String

  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateLocator(jsonValue, path: "$")
    let object = try SharedRecordValidator.object(jsonValue, path: "$")
    href = try SharedRecordValidator.string(
      SharedRecordValidator.required(object, "href", path: "$"),
      path: "$/href"
    )
    type = try SharedRecordValidator.string(
      SharedRecordValidator.required(object, "type", path: "$"),
      path: "$/type"
    )
    self.jsonValue = jsonValue
  }
}

struct SharedReaderGeometryRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateGeometry(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedPublicationSummaryRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validatePublicationSummary(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedNavigationUnitRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateNavigationUnit(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderLocationEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateLocationEvent(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderSelectionRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateSelection(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderSelectionChangeEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateSelectionChangeEvent(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderSelectionActionEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateSelectionActionEvent(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderDecorationRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateDecoration(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderDecorationActivationEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateDecorationActivationEvent(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedFootnoteEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateFootnote(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderLinkEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateReaderLink(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderImageActivationEventRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateReaderImageActivation(jsonValue, path: "$")
    self.jsonValue = jsonValue
  }
}

struct SharedReaderErrorRecord: SharedJSONBackedRecord {
  let jsonValue: SharedJSONValue
  let code: SharedReaderErrorCode
  let phase: SharedReaderErrorPhase
  let message: String
  let recoverable: Bool

  init(validating jsonValue: SharedJSONValue) throws {
    try SharedRecordValidator.validateReaderError(jsonValue, path: "$")
    let object = try SharedRecordValidator.object(jsonValue, path: "$")
    code = SharedReaderErrorCode(
      rawValue: try SharedRecordValidator.string(
        SharedRecordValidator.required(object, "code", path: "$"),
        path: "$/code"
      )
    )!
    phase = SharedReaderErrorPhase(
      rawValue: try SharedRecordValidator.string(
        SharedRecordValidator.required(object, "phase", path: "$"),
        path: "$/phase"
      )
    )!
    message = try SharedRecordValidator.string(
      SharedRecordValidator.required(object, "message", path: "$"),
      path: "$/message"
    )
    recoverable = try SharedRecordValidator.boolean(
      SharedRecordValidator.required(object, "recoverable", path: "$"),
      path: "$/recoverable"
    )
    self.jsonValue = jsonValue
  }
}

enum SharedReaderErrorMapper {
  static func code(for nativeCode: String) -> SharedReaderErrorCode {
    if let code = SharedReaderErrorCode(rawValue: nativeCode) {
      return code
    }
    if nativeCode == "NAVIGATOR_RUNTIME_FAILED" {
      return .resourceLoadFailed
    }
    return .nativeInvariantViolation
  }

  static func phase(for nativePhase: String) -> SharedReaderErrorPhase {
    SharedReaderErrorPhase(rawValue: nativePhase) ?? .render
  }

  static func record(
    nativeCode: String,
    nativePhase: String,
    message: String,
    recoverable: Bool,
    publicationUri: String? = nil,
    nativeDetails: SharedJSONValue? = nil
  ) throws -> SharedReaderErrorRecord {
    let stableCode = code(for: nativeCode)
    let stablePhase = phase(for: nativePhase)
    var object: [String: SharedJSONValue] = [
      "code": .string(stableCode.rawValue),
      "phase": .string(stablePhase.rawValue),
      "message": .string(message),
      "recoverable": .boolean(recoverable),
    ]
    if let publicationUri {
      object["publicationUri"] = .string(publicationUri)
    }
    let needsNativeIdentity = stableCode.rawValue != nativeCode || stablePhase.rawValue != nativePhase
    if needsNativeIdentity {
      var details: [String: SharedJSONValue] = [
        "nativeCode": .string(nativeCode),
        "nativePhase": .string(nativePhase),
      ]
      if let nativeDetails {
        details["details"] = nativeDetails
      }
      object["nativeDetails"] = .object(details)
    } else if let nativeDetails {
      object["nativeDetails"] = nativeDetails
    }
    return try SharedReaderErrorRecord(validating: .object(object))
  }
}

enum SharedCoreRecord: Equatable, Sendable {
  case publicationSource(SharedPublicationSourceRecord)
  case locator(SharedLocatorRecord)
  case readerGeometry(SharedReaderGeometryRecord)
  case publicationSummary(SharedPublicationSummaryRecord)
  case navigationUnit(SharedNavigationUnitRecord)
  case readerLocationEvent(SharedReaderLocationEventRecord)
  case readerSelection(SharedReaderSelectionRecord)
  case readerSelectionChangeEvent(SharedReaderSelectionChangeEventRecord)
  case readerSelectionActionEvent(SharedReaderSelectionActionEventRecord)
  case readerDecoration(SharedReaderDecorationRecord)
  case readerDecorationActivationEvent(SharedReaderDecorationActivationEventRecord)
  case footnoteEvent(SharedFootnoteEventRecord)
  case readerLinkEvent(SharedReaderLinkEventRecord)
  case readerImageActivationEvent(SharedReaderImageActivationEventRecord)
  case readerError(SharedReaderErrorRecord)

  init(type: SharedCoreRecordType, payload: SharedJSONValue) throws {
    switch type {
    case .publicationSource:
      self = .publicationSource(try SharedPublicationSourceRecord(validating: payload))
    case .locator:
      self = .locator(try SharedLocatorRecord(validating: payload))
    case .readerGeometry:
      self = .readerGeometry(try SharedReaderGeometryRecord(validating: payload))
    case .publicationSummary:
      self = .publicationSummary(try SharedPublicationSummaryRecord(validating: payload))
    case .navigationUnit:
      self = .navigationUnit(try SharedNavigationUnitRecord(validating: payload))
    case .readerLocationEvent:
      self = .readerLocationEvent(try SharedReaderLocationEventRecord(validating: payload))
    case .readerSelection:
      self = .readerSelection(try SharedReaderSelectionRecord(validating: payload))
    case .readerSelectionChangeEvent:
      self = .readerSelectionChangeEvent(
        try SharedReaderSelectionChangeEventRecord(validating: payload)
      )
    case .readerSelectionActionEvent:
      self = .readerSelectionActionEvent(
        try SharedReaderSelectionActionEventRecord(validating: payload)
      )
    case .readerDecoration:
      self = .readerDecoration(try SharedReaderDecorationRecord(validating: payload))
    case .readerDecorationActivationEvent:
      self = .readerDecorationActivationEvent(
        try SharedReaderDecorationActivationEventRecord(validating: payload)
      )
    case .footnoteEvent:
      self = .footnoteEvent(try SharedFootnoteEventRecord(validating: payload))
    case .readerLinkEvent:
      self = .readerLinkEvent(try SharedReaderLinkEventRecord(validating: payload))
    case .readerImageActivationEvent:
      self = .readerImageActivationEvent(
        try SharedReaderImageActivationEventRecord(validating: payload)
      )
    case .readerError:
      self = .readerError(try SharedReaderErrorRecord(validating: payload))
    }
  }

  var jsonValue: SharedJSONValue {
    switch self {
    case let .publicationSource(record): record.jsonValue
    case let .locator(record): record.jsonValue
    case let .readerGeometry(record): record.jsonValue
    case let .publicationSummary(record): record.jsonValue
    case let .navigationUnit(record): record.jsonValue
    case let .readerLocationEvent(record): record.jsonValue
    case let .readerSelection(record): record.jsonValue
    case let .readerSelectionChangeEvent(record): record.jsonValue
    case let .readerSelectionActionEvent(record): record.jsonValue
    case let .readerDecoration(record): record.jsonValue
    case let .readerDecorationActivationEvent(record): record.jsonValue
    case let .footnoteEvent(record): record.jsonValue
    case let .readerLinkEvent(record): record.jsonValue
    case let .readerImageActivationEvent(record): record.jsonValue
    case let .readerError(record): record.jsonValue
    }
  }
}

struct SharedCoreRecordEnvelope: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let caseId: String
  let recordType: SharedCoreRecordType
  let record: SharedCoreRecord

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case caseId
    case recordType
    case payload
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
    guard schemaVersion == 1 else {
      throw SharedRecordValidationError(path: "$/schemaVersion", reason: "must be 1")
    }
    caseId = try container.decode(String.self, forKey: .caseId)
    guard !caseId.isEmpty else {
      throw SharedRecordValidationError(path: "$/caseId", reason: "must be non-empty")
    }
    recordType = try container.decode(SharedCoreRecordType.self, forKey: .recordType)
    record = try SharedCoreRecord(
      type: recordType,
      payload: container.decode(SharedJSONValue.self, forKey: .payload)
    )
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(schemaVersion, forKey: .schemaVersion)
    try container.encode(caseId, forKey: .caseId)
    try container.encode(recordType, forKey: .recordType)
    try container.encode(record.jsonValue, forKey: .payload)
  }
}
