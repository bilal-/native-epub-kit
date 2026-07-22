import Foundation

struct PublicationDataLinkShape: Codable, Equatable, Sendable {
  let href: String
  let children: [PublicationDataLinkShape]
}

struct PublicationPositionPageBounds: Equatable, Sendable {
  let offset: Int
  let count: Int
  let nextOffset: Int?
}

enum PublicationDataPolicy {
  static let defaultPositionPageSize = 128
  static let maximumPositionPageSize = 256

  static func positionPageBounds(
    total: Int,
    requestedOffset: Int?,
    requestedLimit: Int?
  ) -> PublicationPositionPageBounds {
    let safeTotal = max(0, total)
    let offset = min(safeTotal, max(0, requestedOffset ?? 0))
    let requested = requestedLimit ?? defaultPositionPageSize
    let limit = min(
      maximumPositionPageSize,
      requested > 0 ? requested : defaultPositionPageSize
    )
    let count = min(limit, safeTotal - offset)
    let end = offset + count
    return PublicationPositionPageBounds(
      offset: offset,
      count: count,
      nextOffset: end < safeTotal ? end : nil
    )
  }

  static func warnings(
    tableOfContents: [PublicationDataLinkShape],
    readingOrderHrefs: [String],
    positionCount: Int,
    fixedLayout: Bool
  ) -> [String] {
    var warnings: [String] = []
    let flattened = flatten(tableOfContents)
    if flattened.isEmpty {
      warnings.append("toc-empty")
    }

    let targets = flattened.map { normalizeTargetHref($0.href) }
    if Set(targets).count != targets.count {
      warnings.append("toc-duplicate-targets")
    }

    let coveredResources = Set(flattened.map { normalizeResourceHref($0.href) })
    let readingOrderResources = Set(readingOrderHrefs.map(normalizeResourceHref))
    if readingOrderResources.contains(where: { !coveredResources.contains($0) }) {
      warnings.append("toc-incomplete")
    }
    if positionCount == 0 {
      warnings.append("positions-unavailable")
    }
    if fixedLayout {
      warnings.append("fixed-layout-preferences-limited")
    }
    return warnings
  }

  private static func flatten(
    _ links: [PublicationDataLinkShape]
  ) -> [PublicationDataLinkShape] {
    var result: [PublicationDataLinkShape] = []
    func visit(_ link: PublicationDataLinkShape, depth: Int) {
      guard depth <= 256 else { return }
      result.append(link)
      for child in link.children {
        visit(child, depth: depth + 1)
      }
    }
    for link in links {
      visit(link, depth: 0)
    }
    return result
  }

  private static func normalizeResourceHref(_ href: String) -> String {
    let resource = href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
      .split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
    var segments: [Substring] = []
    for segment in resource.split(separator: "/", omittingEmptySubsequences: false) {
      if segment.isEmpty || segment == "." { continue }
      if segment == ".." {
        _ = segments.popLast()
      } else {
        segments.append(segment)
      }
    }
    return segments.joined(separator: "/")
  }

  private static func normalizeTargetHref(_ href: String) -> String {
    guard let fragmentIndex = href.firstIndex(of: "#") else {
      return normalizeResourceHref(href)
    }
    return normalizeResourceHref(href) + href[fragmentIndex...]
  }
}
