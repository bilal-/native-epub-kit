import Foundation

struct DecorationPolicyError: Error, Equatable, CustomStringConvertible {
  let path: String
  let reason: String

  var description: String { "\(path): \(reason)" }
}

enum ResolvedNativeDecorationStyle: Equatable, Sendable {
  case highlight(tint: String, isActive: Bool)
  case underline(tint: String, isActive: Bool)
  case marginIcon(asset: String, tint: String)
  case roundedBox(
    tint: String,
    borderRadius: Double,
    borderWidth: Double,
    fillOpacity: Double,
    isActive: Bool
  )

  var jsonObject: [String: Any] {
    switch self {
    case let .highlight(tint, isActive):
      ["type": "highlight", "tint": tint, "isActive": isActive]
    case let .underline(tint, isActive):
      ["type": "underline", "tint": tint, "isActive": isActive]
    case let .marginIcon(asset, tint):
      ["type": "margin-icon", "asset": asset, "tint": tint]
    case let .roundedBox(tint, borderRadius, borderWidth, fillOpacity, isActive):
      [
        "type": "custom",
        "template": "rounded-box-v1",
        "config": [
          "tint": tint,
          "borderRadius": borderRadius,
          "borderWidth": borderWidth,
          "fillOpacity": fillOpacity,
          "isActive": isActive,
        ],
      ]
    }
  }
}

struct ResolvedNativeDecoration: Equatable, Sendable {
  let id: String
  let locator: SharedJSONValue
  let style: ResolvedNativeDecorationStyle
  let data: SharedJSONValue?

  var jsonValue: SharedJSONValue {
    var object: [String: SharedJSONValue] = [
      "id": .string(id),
      "locator": locator,
      "style": DecorationPolicy.sharedJSONValue(style.jsonObject),
    ]
    if let data { object["data"] = data }
    return .object(object)
  }

  var jsonObject: [String: Any] {
    DecorationPolicy.foundationObject(jsonValue)
  }
}

enum ResolvedNativeDecorationChange: Equatable, Sendable {
  case add(ResolvedNativeDecoration)
  case update(ResolvedNativeDecoration)
  case remove(String)
}

enum DecorationPolicy {
  static let maximumGroups = 32
  static let maximumDecorationsPerGroup = 10_000
  static let maximumChanges = 2_048
  static let maximumGroupUTF16Units = 64
  static let maximumIdUTF16Units = 128
  static let maximumDataUTF8Bytes = 8_192

  static let defaultDecorationTint = "#e8c97a"
  static let defaultMarginIconTint = "#64748b"

  static func resolveGroup(_ value: Any?) throws -> String {
    try identifier(value, kind: .group, path: "$/group")
  }

  static func resolveDecoration(_ value: Any?, path: String = "$/decoration") throws
    -> ResolvedNativeDecoration
  {
    let object = try object(value, path: path)
    try exactKeys(object, allowed: ["data", "id", "locator", "style"], path: path)
    let id = try identifier(object["id"], kind: .id, path: "\(path)/id")
    guard let rawLocator = object["locator"] else {
      throw DecorationPolicyError(path: "\(path)/locator", reason: "is required")
    }
    let locatorValue = try sharedJSON(rawLocator, path: "\(path)/locator")
    do {
      _ = try SharedLocatorRecord(validating: locatorValue)
    } catch {
      throw DecorationPolicyError(path: "\(path)/locator", reason: "must be a valid locator")
    }
    let style = try resolveStyle(object["style"], path: "\(path)/style")
    let data: SharedJSONValue?
    if object.keys.contains("data") {
      let rawData = object["data"]!
      let encoded = try jsonData(rawData, path: "\(path)/data", fragmentsAllowed: true)
      guard encoded.count <= maximumDataUTF8Bytes else {
        throw DecorationPolicyError(
          path: "\(path)/data",
          reason: "must contain at most \(maximumDataUTF8Bytes) UTF-8 bytes"
        )
      }
      data = try sharedJSON(rawData, path: "\(path)/data")
    } else {
      data = nil
    }
    let resolved = ResolvedNativeDecoration(id: id, locator: locatorValue, style: style, data: data)
    do {
      _ = try SharedReaderDecorationRecord(validating: resolved.jsonValue)
    } catch {
      throw DecorationPolicyError(path: path, reason: "must be a valid decoration record")
    }
    return resolved
  }

  static func resolveDecorations(group: Any?, values: Any?) throws
    -> (group: String, decorations: [ResolvedNativeDecoration])
  {
    let group = try resolveGroup(group)
    guard let values = values as? [Any] else {
      throw DecorationPolicyError(path: "$/decorations", reason: "must be an array")
    }
    guard values.count <= maximumDecorationsPerGroup else {
      throw DecorationPolicyError(
        path: "$/decorations",
        reason: "must contain at most \(maximumDecorationsPerGroup) decorations"
      )
    }
    var ids = Set<String>()
    let decorations = try values.enumerated().map { index, value in
      let decoration = try resolveDecoration(value, path: "$/decorations/\(index)")
      guard ids.insert(decoration.id).inserted else {
        throw DecorationPolicyError(
          path: "$/decorations/\(index)/id",
          reason: "must be unique within its group"
        )
      }
      return decoration
    }
    return (group, decorations)
  }

  static func resolveChanges(group: Any?, values: Any?) throws
    -> (group: String, changes: [ResolvedNativeDecorationChange])
  {
    let group = try resolveGroup(group)
    guard let values = values as? [Any] else {
      throw DecorationPolicyError(path: "$/changes", reason: "must be an array")
    }
    guard values.count <= maximumChanges else {
      throw DecorationPolicyError(
        path: "$/changes",
        reason: "must contain at most \(maximumChanges) changes"
      )
    }
    let changes: [ResolvedNativeDecorationChange] = try values.enumerated().map { index, value in
      let path = "$/changes/\(index)"
      let object = try object(value, path: path)
      guard let type = object["type"] as? String else {
        throw DecorationPolicyError(path: "\(path)/type", reason: "must be a string")
      }
      switch type {
      case "add", "update":
        try exactKeys(object, allowed: ["decoration", "type"], path: path)
        let decoration = try resolveDecoration(object["decoration"], path: "\(path)/decoration")
        return type == "add"
          ? ResolvedNativeDecorationChange.add(decoration)
          : ResolvedNativeDecorationChange.update(decoration)
      case "remove":
        try exactKeys(object, allowed: ["id", "type"], path: path)
        return .remove(try identifier(object["id"], kind: .id, path: "\(path)/id"))
      default:
        throw DecorationPolicyError(path: "\(path)/type", reason: "is unsupported")
      }
    }
    return (group, changes)
  }

  static func applyChanges(
    current: [ResolvedNativeDecoration],
    changes: [ResolvedNativeDecorationChange]
  ) throws -> [ResolvedNativeDecoration] {
    var next = current
    var indexById = Dictionary(uniqueKeysWithValues: next.enumerated().map { ($0.element.id, $0.offset) })
    for change in changes {
      switch change {
      case let .add(decoration):
        guard indexById[decoration.id] == nil else {
          throw DecorationPolicyError(path: "$/changes", reason: "add references an existing id")
        }
        guard next.count < maximumDecorationsPerGroup else {
          throw DecorationPolicyError(
            path: "$/changes",
            reason: "would exceed \(maximumDecorationsPerGroup) decorations"
          )
        }
        indexById[decoration.id] = next.count
        next.append(decoration)
      case let .update(decoration):
        guard let index = indexById[decoration.id] else {
          throw DecorationPolicyError(path: "$/changes", reason: "update references a missing id")
        }
        next[index] = decoration
      case let .remove(id):
        guard let index = indexById[id] else {
          throw DecorationPolicyError(path: "$/changes", reason: "remove references a missing id")
        }
        next.remove(at: index)
        indexById = Dictionary(
          uniqueKeysWithValues: next.enumerated().map { ($0.element.id, $0.offset) }
        )
      }
    }
    return next
  }

  static func sharedJSONValue(_ value: Any) -> SharedJSONValue {
    // Every caller supplies a closed, normalized JSON object.
    try! sharedJSON(value, path: "$")
  }

  static func foundationObject(_ value: SharedJSONValue) -> [String: Any] {
    let data = try! JSONEncoder().encode(value)
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
  }

  private enum IdentifierKind { case group, id }

  private static func identifier(
    _ value: Any?,
    kind: IdentifierKind,
    path: String
  ) throws -> String {
    guard let value = value as? String else {
      throw DecorationPolicyError(path: path, reason: "must be a string")
    }
    let normalized = value.precomposedStringWithCanonicalMapping
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let limit = kind == .group ? maximumGroupUTF16Units : maximumIdUTF16Units
    let bytes = Array(normalized.utf8)
    let firstIsValid: Bool
    if let first = bytes.first {
      firstIsValid = kind == .group ? isASCIIAlpha(first) : isASCIIAlphaNumeric(first)
    } else {
      firstIsValid = false
    }
    guard
      normalized.utf16.count <= limit,
      firstIsValid,
      bytes.allSatisfy({ isASCIIAlphaNumeric($0) || [46, 58, 95, 45].contains($0) })
    else {
      throw DecorationPolicyError(path: path, reason: "has an unsupported format")
    }
    return normalized
  }

  private static func resolveStyle(_ value: Any?, path: String) throws
    -> ResolvedNativeDecorationStyle
  {
    let object = try object(value, path: path)
    guard let type = object["type"] as? String else {
      throw DecorationPolicyError(path: "\(path)/type", reason: "must be a string")
    }
    switch type {
    case "highlight", "underline":
      try exactKeys(object, allowed: ["isActive", "tint", "type"], path: path)
      let tint = try normalizeTint(object["tint"], fallback: nil, path: "\(path)/tint")
      let isActive = try optionalBoolean(object["isActive"], fallback: false, path: "\(path)/isActive")
      return type == "highlight"
        ? .highlight(tint: tint, isActive: isActive)
        : .underline(tint: tint, isActive: isActive)
    case "margin-icon":
      try exactKeys(object, allowed: ["asset", "tint", "type"], path: path)
      guard let asset = object["asset"] as? String, ["bookmark", "note"].contains(asset) else {
        throw DecorationPolicyError(path: "\(path)/asset", reason: "is unsupported")
      }
      return .marginIcon(
        asset: asset,
        tint: try normalizeTint(
          object["tint"],
          fallback: defaultMarginIconTint,
          path: "\(path)/tint"
        )
      )
    case "custom":
      try exactKeys(object, allowed: ["config", "template", "type"], path: path)
      guard object["template"] as? String == "rounded-box-v1" else {
        throw DecorationPolicyError(path: "\(path)/template", reason: "is unsupported")
      }
      let config = if let value = object["config"] {
        try self.object(value, path: "\(path)/config")
      } else {
        [String: Any]()
      }
      try exactKeys(
        config,
        allowed: ["borderRadius", "borderWidth", "fillOpacity", "isActive", "tint"],
        path: "\(path)/config"
      )
      return .roundedBox(
        tint: try normalizeTint(
          config["tint"],
          fallback: defaultDecorationTint,
          path: "\(path)/config/tint"
        ),
        borderRadius: try boundedNumber(
          config["borderRadius"], fallback: 4, minimum: 0, maximum: 12,
          path: "\(path)/config/borderRadius"
        ),
        borderWidth: try boundedNumber(
          config["borderWidth"], fallback: 2, minimum: 1, maximum: 4,
          path: "\(path)/config/borderWidth"
        ),
        fillOpacity: try boundedNumber(
          config["fillOpacity"], fallback: 0.12, minimum: 0, maximum: 0.5,
          path: "\(path)/config/fillOpacity"
        ),
        isActive: try optionalBoolean(
          config["isActive"], fallback: false, path: "\(path)/config/isActive"
        )
      )
    default:
      throw DecorationPolicyError(path: "\(path)/type", reason: "is unsupported")
    }
  }

  private static func normalizeTint(_ value: Any?, fallback: String?, path: String) throws
    -> String
  {
    let resolved: Any? = value ?? fallback
    guard let tint = resolved as? String else {
      throw DecorationPolicyError(path: path, reason: "must be a string")
    }
    let bytes = Array(tint.utf8)
    guard
      (bytes.count == 7 || bytes.count == 9),
      bytes.first == 35,
      bytes.dropFirst().allSatisfy(isASCIIHex)
    else {
      throw DecorationPolicyError(path: path, reason: "must use #RRGGBB or #RRGGBBAA")
    }
    return tint.lowercased()
  }

  private static func optionalBoolean(_ value: Any?, fallback: Bool, path: String) throws -> Bool {
    guard let value else { return fallback }
    guard let value = value as? Bool else {
      throw DecorationPolicyError(path: path, reason: "must be a boolean")
    }
    return value
  }

  private static func boundedNumber(
    _ value: Any?,
    fallback: Double,
    minimum: Double,
    maximum: Double,
    path: String
  ) throws -> Double {
    guard let value else { return fallback }
    guard !(value is Bool), let number = value as? NSNumber else {
      throw DecorationPolicyError(path: path, reason: "must be a number")
    }
    let result = number.doubleValue
    guard result.isFinite, result >= minimum, result <= maximum else {
      throw DecorationPolicyError(path: path, reason: "must be within \(minimum)...\(maximum)")
    }
    return result
  }

  private static func object(_ value: Any?, path: String) throws -> [String: Any] {
    guard let value = value as? [String: Any] else {
      throw DecorationPolicyError(path: path, reason: "must be an object")
    }
    return value
  }

  private static func exactKeys(
    _ value: [String: Any],
    allowed: Set<String>,
    path: String
  ) throws {
    if let key = value.keys.first(where: { !allowed.contains($0) }) {
      throw DecorationPolicyError(path: "\(path)/\(key)", reason: "is not supported")
    }
  }

  private static func sharedJSON(_ value: Any, path: String) throws -> SharedJSONValue {
    let data = try jsonData(value, path: path, fragmentsAllowed: true)
    do {
      return try JSONDecoder().decode(SharedJSONValue.self, from: data)
    } catch {
      throw DecorationPolicyError(path: path, reason: "must be valid JSON")
    }
  }

  private static func jsonData(_ value: Any, path: String, fragmentsAllowed: Bool) throws -> Data {
    guard JSONSerialization.isValidJSONObject(value) || fragmentsAllowed else {
      throw DecorationPolicyError(path: path, reason: "must be valid JSON")
    }
    do {
      return try JSONSerialization.data(
        withJSONObject: value,
        options: fragmentsAllowed ? [.fragmentsAllowed, .withoutEscapingSlashes] : []
      )
    } catch {
      throw DecorationPolicyError(path: path, reason: "must be valid JSON")
    }
  }

  private static func isASCIIAlpha(_ byte: UInt8) -> Bool {
    (65 ... 90).contains(byte) || (97 ... 122).contains(byte)
  }

  private static func isASCIIAlphaNumeric(_ byte: UInt8) -> Bool {
    isASCIIAlpha(byte) || (48 ... 57).contains(byte)
  }

  private static func isASCIIHex(_ byte: UInt8) -> Bool {
    (48 ... 57).contains(byte) || (65 ... 70).contains(byte) || (97 ... 102).contains(byte)
  }
}
