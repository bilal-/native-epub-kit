import Foundation
import ReadiumShared

struct PublicationDataSnapshot: Sendable {
  let info: [String: SharedJSONValue]
  let positions: [SharedJSONValue]

  func publicationInfoValue(
    instanceId: String,
    generation: Int,
    mappingDurationMilliseconds: Int
  ) -> [String: Any] {
    var value = info
    value["instanceId"] = .string(instanceId)
    value["generation"] = .integer(Int64(generation))
    if case var .object(capabilities) = value["capabilities"] {
      capabilities["mappingDurationMilliseconds"] = .integer(
        Int64(max(0, mappingDurationMilliseconds))
      )
      value["capabilities"] = .object(capabilities)
    }
    return value.mapValues(\.foundationValue)
  }

  func positionsPageValue(
    instanceId: String,
    generation: Int,
    requestedOffset: Int,
    requestedLimit: Int
  ) -> [String: Any] {
    let bounds = PublicationDataPolicy.positionPageBounds(
      total: positions.count,
      requestedOffset: requestedOffset,
      requestedLimit: requestedLimit
    )
    let page = positions[bounds.offset ..< bounds.offset + bounds.count]
      .map(\.foundationValue)
    var value: [String: Any] = [
      "generation": generation,
      "instanceId": instanceId,
      "offset": bounds.offset,
      "positions": page,
      "total": positions.count,
    ]
    if let nextOffset = bounds.nextOffset {
      value["nextOffset"] = nextOffset
    }
    return value
  }

  func diagnosticsInput(mappingDurationMilliseconds: Int) -> ReaderDiagnosticsPublicationInput {
    let layout = info["layout"]?.stringValue ?? "reflowable"
    let readingProgression = info["readingProgression"]?.stringValue ?? "auto"
    let capabilities = info["capabilities"]?.objectValue ?? [:]
    return ReaderDiagnosticsPublicationInput(
      layout: layout,
      readingProgression: readingProgression,
      positionCount: positions.count,
      progressPrecision: capabilities["progressPrecision"]?.stringValue
        ?? (positions.isEmpty ? "resource" : "position"),
      mappingDurationMilliseconds: max(0, mappingDurationMilliseconds),
      capabilities: Dictionary(
        uniqueKeysWithValues: [
          "customFonts",
          "decorations",
          "footnotes",
          "images",
          "positions",
          "search",
          "selection",
        ].map { ($0, capabilities[$0]?.booleanValue == true) }
      ),
      warnings: capabilities["warnings"]?.stringArrayValue ?? []
    )
  }
}

enum PublicationDataMapper {
  static func map(
    metadata: Metadata,
    tableOfContents: [Link],
    readingOrder: [Link],
    positions: [Locator],
    continuousProgressAvailable: Bool
  ) -> PublicationDataSnapshot {
    let mappedTOC = tableOfContents.map { mapLink($0, depth: 0) }
    let mappedReadingOrder = readingOrder.map { mapLink($0, depth: 0) }
    let mappedPositions = positions.map { mapJSON(.object($0.jsonObject)) }
    let fixedLayout = metadata.layout == .fixed
    var warnings = PublicationDataPolicy.warnings(
      tableOfContents: tableOfContents.map(linkShape),
      readingOrderHrefs: readingOrder.map(\.href),
      positionCount: mappedPositions.count,
      fixedLayout: fixedLayout
    )
    let trimmedTitle = metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = trimmedTitle.flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled publication"
    if trimmedTitle == nil || trimmedTitle?.isEmpty == true {
      warnings.insert("publication-title-missing", at: 0)
    }

    let precision = continuousProgressAvailable
      ? "continuous"
      : (mappedPositions.isEmpty ? "resource" : "position")
    let capabilities: [String: SharedJSONValue] = [
      "customFonts": .boolean(!fixedLayout),
      "decorations": .boolean(true),
      "fixedLayout": .boolean(fixedLayout),
      "footnotes": .boolean(true),
      "images": .boolean(true),
      "hasTableOfContents": .boolean(!tableOfContents.isEmpty),
      "positionPaging": .boolean(true),
      "positions": .boolean(!mappedPositions.isEmpty),
      "progressPrecision": .string(precision),
      "search": .boolean(true),
      "selection": .boolean(true),
      "warnings": .array(warnings.map(SharedJSONValue.string)),
    ]

    var info: [String: SharedJSONValue] = [
      "authors": .array(metadata.authors.map(mapContributor)),
      "capabilities": .object(capabilities),
      "languages": .array(metadata.languages.map(SharedJSONValue.string)),
      "layout": .string(fixedLayout ? "fixed" : "reflowable"),
      "positionCount": .integer(Int64(mappedPositions.count)),
      "readingOrder": .array(mappedReadingOrder),
      "readingProgression": .string(metadata.readingProgression.rawValue),
      "tableOfContents": .array(mappedTOC),
      "title": .string(title),
    ]
    if let identifier = metadata.identifier, !identifier.isEmpty {
      info["identifier"] = .string(identifier)
    }
    if let subtitle = metadata.subtitle, !subtitle.isEmpty {
      info["subtitle"] = .string(subtitle)
    }
    return PublicationDataSnapshot(info: info, positions: mappedPositions)
  }

  private static func mapContributor(_ contributor: Contributor) -> SharedJSONValue {
    var value: [String: SharedJSONValue] = ["name": .string(contributor.name)]
    if let identifier = contributor.identifier, !identifier.isEmpty {
      value["identifier"] = .string(identifier)
    }
    if let sortAs = contributor.sortAs, !sortAs.isEmpty {
      value["sortAs"] = .string(sortAs)
    }
    if !contributor.roles.isEmpty {
      value["roles"] = .array(contributor.roles.sorted().map(SharedJSONValue.string))
    }
    return .object(value)
  }

  private static func mapLink(_ link: Link, depth: Int) -> SharedJSONValue {
    var value: [String: SharedJSONValue] = [
      "children": .array(
        depth >= 256 ? [] : link.children.map { mapLink($0, depth: depth + 1) }
      ),
      "href": .string(link.href),
    ]
    if let title = link.title, !title.isEmpty {
      value["title"] = .string(title)
    }
    if let type = link.mediaType?.string, !type.isEmpty {
      value["type"] = .string(type)
    }
    if !link.rels.isEmpty {
      value["rel"] = .array(link.rels.map(\.rawValue).sorted().map(SharedJSONValue.string))
    }
    if !link.properties.otherProperties.isEmpty {
      value["properties"] = .object(link.properties.otherProperties.mapValues(mapJSON))
    }
    return .object(value)
  }

  private static func linkShape(_ link: Link) -> PublicationDataLinkShape {
    PublicationDataLinkShape(
      href: link.href,
      children: link.children.map(linkShape)
    )
  }

  private static func mapJSON(_ value: ReadiumShared.JSONValue) -> SharedJSONValue {
    switch value {
    case .null:
      .null
    case let .bool(value):
      .boolean(value)
    case let .string(value):
      .string(value)
    case let .integer(value):
      .integer(Int64(value))
    case let .double(value):
      .number(value)
    case let .array(value):
      .array(value.map(mapJSON))
    case let .object(value):
      .object(value.mapValues(mapJSON))
    }
  }
}

extension SharedJSONValue {
  fileprivate var booleanValue: Bool? {
    guard case let .boolean(value) = self else { return nil }
    return value
  }

  fileprivate var objectValue: [String: SharedJSONValue]? {
    guard case let .object(value) = self else { return nil }
    return value
  }

  fileprivate var stringArrayValue: [String]? {
    guard case let .array(value) = self else { return nil }
    return value.compactMap(\.stringValue)
  }

  fileprivate var stringValue: String? {
    guard case let .string(value) = self else { return nil }
    return value
  }

  fileprivate var foundationValue: Any {
    switch self {
    case .null:
      NSNull()
    case let .boolean(value):
      value
    case let .integer(value):
      value
    case let .number(value):
      value
    case let .string(value):
      value
    case let .array(value):
      value.map(\.foundationValue)
    case let .object(value):
      value.mapValues(\.foundationValue)
    }
  }
}
