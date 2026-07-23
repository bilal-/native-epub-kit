import Foundation

enum ReaderImagePolicyError: Error, Equatable {
  case invalid
}

enum ReaderImageUse: String, Sendable {
  case zoom
  case share
}

struct ResolvedReaderImagePolicy: Equatable, Sendable {
  let allowSharing: Bool
  let allowZoom: Bool

  var jsonObject: [String: Any] {
    ["allowSharing": allowSharing, "allowZoom": allowZoom]
  }
}

enum ReaderImagePolicy {
  static let maximumSourceHandleUTF16Units = 128
  static let `default` = ResolvedReaderImagePolicy(allowSharing: false, allowZoom: true)

  static func resolve(json: String?) throws -> ResolvedReaderImagePolicy {
    guard let json else { return `default` }
    return try resolve(JSONSerialization.jsonObject(with: Data(json.utf8)))
  }

  static func resolve(_ value: Any?) throws -> ResolvedReaderImagePolicy {
    guard let value, !(value is NSNull) else { return `default` }
    guard let object = value as? [String: Any] else { throw ReaderImagePolicyError.invalid }
    guard object.keys.allSatisfy({ $0 == "allowSharing" || $0 == "allowZoom" }) else {
      throw ReaderImagePolicyError.invalid
    }
    let sharing = object["allowSharing"] ?? `default`.allowSharing
    let zoom = object["allowZoom"] ?? `default`.allowZoom
    guard let allowSharing = sharing as? Bool, let allowZoom = zoom as? Bool else {
      throw ReaderImagePolicyError.invalid
    }
    return ResolvedReaderImagePolicy(allowSharing: allowSharing, allowZoom: allowZoom)
  }

  static func allows(_ use: ReaderImageUse, policy: ResolvedReaderImagePolicy) -> Bool {
    switch use {
    case .zoom: policy.allowZoom
    case .share: policy.allowSharing
    }
  }

  static func validateSourceHandle(_ value: String) throws -> String {
    guard !value.isEmpty, value.utf16.count <= maximumSourceHandleUTF16Units else {
      throw ReaderImagePolicyError.invalid
    }
    return value
  }
}
