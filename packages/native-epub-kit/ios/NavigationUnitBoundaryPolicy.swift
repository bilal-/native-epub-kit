import Foundation

enum NavigationUnitBoundaryPolicyError: Error, Equatable {
  case invalid(String)
}

struct ReaderNavigationBoundaryLocation: Decodable, Equatable, Sendable {
  let href: String
  let fragments: [String]
  let position: Int?
  let totalProgression: Double?

  private enum CodingKeys: String, CodingKey {
    case href
    case locations
  }

  private struct Locations: Decodable {
    let fragments: [String]
    let position: Int?
    let totalProgression: Double?

    private enum CodingKeys: String, CodingKey {
      case fragments
      case position
      case totalProgression
    }

    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      fragments = try values.decodeIfPresent([String].self, forKey: .fragments) ?? []
      position = try values.decodeIfPresent(Int.self, forKey: .position)
      totalProgression = try values.decodeIfPresent(Double.self, forKey: .totalProgression)
    }
  }

  init(href: String, fragments: [String], position: Int?, totalProgression: Double?) {
    self.href = href
    self.fragments = fragments
    self.position = position
    self.totalProgression = totalProgression
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    href = try values.decode(String.self, forKey: .href)
    let locations = try values.decode(Locations.self, forKey: .locations)
    fragments = locations.fragments
    position = locations.position
    totalProgression = locations.totalProgression
  }
}

struct ReaderNavigationUnitBoundary: Codable, Equatable, Sendable {
  let endPositionExclusive: Int?
  let endTotalProgression: Double?
  let href: String
  let id: String
  let startPosition: Int?
  let startTotalProgression: Double?
}

struct ReaderNavigationUnitBoundaryConfiguration: Codable, Equatable, Sendable {
  let generation: Int
  let instanceId: String
  let precision: String
  let units: [ReaderNavigationUnitBoundary]

  init(jsonString: String) throws {
    do {
      self = try JSONDecoder().decode(
        ReaderNavigationUnitBoundaryConfiguration.self,
        from: Data(jsonString.utf8)
      )
    } catch {
      throw NavigationUnitBoundaryPolicyError.invalid(
        "navigation-unit boundary configuration is invalid"
      )
    }
    try validate()
  }

  init(
    generation: Int,
    instanceId: String,
    precision: String,
    units: [ReaderNavigationUnitBoundary]
  ) throws {
    self.generation = generation
    self.instanceId = instanceId
    self.precision = precision
    self.units = units
    try validate()
  }

  private func validate() throws {
    guard generation >= 0, !instanceId.isEmpty else {
      throw NavigationUnitBoundaryPolicyError.invalid("navigation-unit identity is invalid")
    }
    guard ["continuous", "position", "resource"].contains(precision), !units.isEmpty else {
      throw NavigationUnitBoundaryPolicyError.invalid("navigation-unit precision is invalid")
    }
    guard Set(units.map(\.id)).count == units.count else {
      throw NavigationUnitBoundaryPolicyError.invalid("navigation-unit IDs must be unique")
    }
    for unit in units {
      guard !unit.id.isEmpty, !unit.href.isEmpty else {
        throw NavigationUnitBoundaryPolicyError.invalid("navigation-unit identity is empty")
      }
      if let start = unit.startPosition, let end = unit.endPositionExclusive {
        guard start >= 1, end > start else {
          throw NavigationUnitBoundaryPolicyError.invalid(
            "navigation-unit position interval is invalid"
          )
        }
      }
      if let start = unit.startTotalProgression, let end = unit.endTotalProgression {
        guard
          start.isFinite,
          end.isFinite,
          0 ... 1 ~= start,
          0 ... 1 ~= end,
          end > start
        else {
          throw NavigationUnitBoundaryPolicyError.invalid(
            "navigation-unit progression interval is invalid"
          )
        }
      }
    }
  }
}

struct ReaderNavigationUnitBoundaryMatch: Equatable, Sendable {
  let index: Int
  let precision: String
  let unit: ReaderNavigationUnitBoundary
}

enum NavigationUnitBoundaryPolicy {
  private static let progressionEpsilon = 1e-9

  static func match(
    configuration: ReaderNavigationUnitBoundaryConfiguration,
    location: ReaderNavigationBoundaryLocation,
    preferredUnitId: String? = nil
  ) -> ReaderNavigationUnitBoundaryMatch? {
    switch configuration.precision {
    case "continuous":
      return continuous(configuration.units, location)
        ?? position(configuration.units, location)
        ?? resource(configuration.units, location, preferredUnitId)
    case "position":
      return position(configuration.units, location)
        ?? resource(configuration.units, location, preferredUnitId)
    default:
      return resource(configuration.units, location, preferredUnitId)
    }
  }

  private static func continuous(
    _ units: [ReaderNavigationUnitBoundary],
    _ location: ReaderNavigationBoundaryLocation
  ) -> ReaderNavigationUnitBoundaryMatch? {
    guard let value = location.totalProgression, value.isFinite else { return nil }
    let exact = units.firstIndex { unit in
      guard let start = unit.startTotalProgression else { return false }
      return abs(start - value) <= progressionEpsilon
    }
    let index = exact ?? units.firstIndex { unit in
      guard
        let start = unit.startTotalProgression,
        let end = unit.endTotalProgression,
        end > start
      else {
        return false
      }
      let publicationEnd =
        abs(value - 1) <= progressionEpsilon && abs(end - 1) <= progressionEpsilon
      return value >= start && (value < end || publicationEnd)
    }
    guard let index else { return nil }
    return ReaderNavigationUnitBoundaryMatch(
      index: index,
      precision: "continuous",
      unit: units[index]
    )
  }

  private static func position(
    _ units: [ReaderNavigationUnitBoundary],
    _ location: ReaderNavigationBoundaryLocation
  ) -> ReaderNavigationUnitBoundaryMatch? {
    guard let value = location.position else { return nil }
    let exact = units.firstIndex { $0.startPosition == value }
    let index = exact ?? units.firstIndex { unit in
      guard let start = unit.startPosition, let end = unit.endPositionExclusive else {
        return false
      }
      return value >= start && value < end
    }
    guard let index else { return nil }
    return ReaderNavigationUnitBoundaryMatch(
      index: index,
      precision: "position",
      unit: units[index]
    )
  }

  private static func resource(
    _ units: [ReaderNavigationUnitBoundary],
    _ location: ReaderNavigationBoundaryLocation,
    _ preferredUnitId: String?
  ) -> ReaderNavigationUnitBoundaryMatch? {
    if let fragment = location.fragments.first {
      let target = normalizedTarget(
        "\(normalizedResource(location.href))#\(normalizedFragment(fragment))"
      )
      if let index = units.firstIndex(where: { normalizedTarget($0.href) == target }) {
        return ReaderNavigationUnitBoundaryMatch(
          index: index,
          precision: "resource",
          unit: units[index]
        )
      }
    }
    let resource = normalizedResource(location.href)
    let matching = units.indices.filter { normalizedResource(units[$0].href) == resource }
    if let preferredUnitId,
       let index = matching.first(where: { units[$0].id == preferredUnitId })
    {
      return ReaderNavigationUnitBoundaryMatch(
        index: index,
        precision: "resource",
        unit: units[index]
      )
    }
    guard let index = matching.first else { return nil }
    return ReaderNavigationUnitBoundaryMatch(
      index: index,
      precision: "resource",
      unit: units[index]
    )
  }

  private static func normalizedResource(_ href: String) -> String {
    let withoutFragment = href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1).first.map(String.init)
      ?? withoutFragment
    let decoded = withoutQuery.removingPercentEncoding ?? withoutQuery
    var segments: [String] = []
    for raw in decoded.precomposedStringWithCanonicalMapping.split(separator: "/") {
      let segment = String(raw)
      if segment == "." || segment.isEmpty { continue }
      if segment == ".." {
        _ = segments.popLast()
      } else {
        segments.append(segment)
      }
    }
    return segments.joined(separator: "/")
  }

  private static func normalizedFragment(_ fragment: String) -> String {
    (fragment.removingPercentEncoding ?? fragment).precomposedStringWithCanonicalMapping
  }

  private static func normalizedTarget(_ href: String) -> String {
    let parts = href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
    let resource = normalizedResource(String(parts[0]))
    guard parts.count > 1 else { return resource }
    return "\(resource)#\(normalizedFragment(String(parts[1])))"
  }
}
