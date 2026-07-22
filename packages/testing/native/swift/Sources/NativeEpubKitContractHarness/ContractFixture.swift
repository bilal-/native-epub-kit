import Foundation

public enum JSONValue: Equatable, Sendable {
  case null
  case boolean(Bool)
  case integer(Int64)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public func value(atJSONPointer pointer: String) -> JSONValue? {
    if pointer.isEmpty {
      return self
    }
    guard pointer.first == "/" else {
      return nil
    }

    return pointer.dropFirst().split(separator: "/", omittingEmptySubsequences: false).reduce(self) {
      current, encodedSegment in
      let segment = encodedSegment.replacingOccurrences(of: "~1", with: "/")
        .replacingOccurrences(of: "~0", with: "~")
      switch current {
      case let .array(values):
        guard let index = Int(segment), values.indices.contains(index) else {
          return nil
        }
        return values[index]
      case let .object(values):
        return values[segment]
      default:
        return nil
      }
    }
  }
}

extension JSONValue: Codable {
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .boolean(value)
    } else if let value = try? container.decode(Int64.self) {
      self = .integer(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Unsupported JSON value"
      )
    }
  }

  public func encode(to encoder: Encoder) throws {
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

public struct ContractExpectations: Codable, Equatable, Sendable {
  public let requiredJsonPointers: [String]
  public let explicitNullJsonPointers: [String]
}

public struct ContractFixture: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let caseId: String
  public let recordType: String
  public let payload: JSONValue
  public let expectations: ContractExpectations

  public var jsonValue: JSONValue {
    .object([
      "schemaVersion": .integer(Int64(schemaVersion)),
      "caseId": .string(caseId),
      "recordType": .string(recordType),
      "payload": payload,
      "expectations": .object([
        "requiredJsonPointers": .array(expectations.requiredJsonPointers.map(JSONValue.string)),
        "explicitNullJsonPointers": .array(
          expectations.explicitNullJsonPointers.map(JSONValue.string)
        ),
      ]),
    ])
  }
}
