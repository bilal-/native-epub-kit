import Foundation

struct ResolvedNativeSelectionAction: Equatable, Sendable {
  let id: String
  let title: String

  var jsonObject: [String: Any] { ["id": id, "title": title] }
}

struct SelectionActionPolicyError: Error, Equatable, CustomStringConvertible {
  let path: String
  let reason: String

  var description: String { "\(path): \(reason)" }
}

enum SelectionActionPolicy {
  static let maximumActions = 8
  static let maximumActionIdUTF16Units = 64
  static let maximumActionTitleUTF16Units = 64
  static let maximumSelectionTextUTF16Units = 8_192
  static let maximumSelectionContextUTF16Units = 512

  static func resolve(_ value: SharedJSONValue?) throws -> [ResolvedNativeSelectionAction] {
    guard let value else { return [] }
    let foundationValue = try JSONSerialization.jsonObject(
      with: JSONEncoder().encode(value),
      options: [.fragmentsAllowed]
    )
    return try resolve(foundationValue)
  }

  static func resolve(_ value: Any?) throws -> [ResolvedNativeSelectionAction] {
    guard let value, !(value is NSNull) else { return [] }
    guard let input = value as? [Any] else {
      throw SelectionActionPolicyError(path: "$/actions", reason: "must be an array")
    }
    guard input.count <= maximumActions else {
      throw SelectionActionPolicyError(
        path: "$/actions",
        reason: "must contain at most \(maximumActions) actions"
      )
    }

    var ids = Set<String>()
    return try input.enumerated().map { index, value in
      let path = "$/actions/\(index)"
      guard let object = value as? [String: Any] else {
        throw SelectionActionPolicyError(path: path, reason: "must be an object")
      }
      for key in object.keys where key != "id" && key != "title" {
        throw SelectionActionPolicyError(path: "\(path)/\(key)", reason: "is not supported")
      }
      guard let rawId = object["id"] as? String else {
        throw SelectionActionPolicyError(path: "\(path)/id", reason: "must be a string")
      }
      let id = rawId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard id.utf16.count <= maximumActionIdUTF16Units, isValidActionId(id) else {
        throw SelectionActionPolicyError(
          path: "\(path)/id",
          reason: "must be a safe ASCII identifier within \(maximumActionIdUTF16Units) UTF-16 units"
        )
      }
      guard ids.insert(id).inserted else {
        throw SelectionActionPolicyError(path: "\(path)/id", reason: "must be unique")
      }
      let title = try normalizeTitle(object["title"], path: "\(path)/title")
      return ResolvedNativeSelectionAction(id: id, title: title)
    }
  }

  static func textDirection(_ value: String) -> String {
    for scalar in value.unicodeScalars {
      if isRTL(scalar.value) { return "rtl" }
      switch scalar.properties.generalCategory {
      case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter:
        return "ltr"
      default:
        continue
      }
    }
    return "auto"
  }

  private static func normalizeTitle(_ value: Any?, path: String) throws -> String {
    guard let value = value as? String else {
      throw SelectionActionPolicyError(path: path, reason: "must be a string")
    }
    let title = value.precomposedStringWithCanonicalMapping
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, title.utf16.count <= maximumActionTitleUTF16Units else {
      throw SelectionActionPolicyError(
        path: path,
        reason: "must contain 1-\(maximumActionTitleUTF16Units) UTF-16 units"
      )
    }
    guard !title.unicodeScalars.contains(where: { $0.properties.generalCategory == .control }) else {
      throw SelectionActionPolicyError(path: path, reason: "must not contain control characters")
    }
    return title
  }

  private static func isValidActionId(_ value: String) -> Bool {
    guard let first = value.utf8.first, isASCIIAlpha(first), !value.isEmpty else { return false }
    return value.utf8.allSatisfy { byte in
      isASCIIAlpha(byte) || (48...57).contains(byte) || byte == 46 || byte == 58 || byte == 95
        || byte == 45
    }
  }

  private static func isASCIIAlpha(_ byte: UInt8) -> Bool {
    (65...90).contains(byte) || (97...122).contains(byte)
  }

  private static func isRTL(_ scalar: UInt32) -> Bool {
    (0x0590...0x08FF).contains(scalar)
      || (0xFB1D...0xFDFF).contains(scalar)
      || (0xFE70...0xFEFF).contains(scalar)
      || (0x1EE00...0x1EEFF).contains(scalar)
  }
}
