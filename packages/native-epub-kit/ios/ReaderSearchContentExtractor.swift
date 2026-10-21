import Foundation
import ReadiumShared
import SwiftSoup

/// Extracts searchable HTML text with block boundaries and tolerant parsing.
struct ReaderSearchContentExtractorFactory: ResourceContentExtractorFactory {
  func makeExtractor(for resource: Resource, mediaType: MediaType) -> ResourceContentExtractor? {
    guard mediaType.isHTML else { return nil }
    return ReaderSearchHTMLContentExtractor()
  }
}

private struct ReaderSearchHTMLContentExtractor: ResourceContentExtractor {
  func extractText(of resource: Resource) async -> ReadResult<String> {
    let result = await resource.read().asString()
    switch result {
    case let .failure(error):
      return .failure(error)
    case let .success(html):
      do {
        let document = try SwiftSoup.parse(html)
        return .success(try document.body()?.text() ?? "")
      } catch {
        return .failure(.decoding(error))
      }
    }
  }
}
