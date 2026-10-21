import Foundation
import ReadiumShared

@main struct ReaderSearchContentExtractorHarness {
  struct TestCase {
    let name: String
    let body: String
    let query: String
    let expectedCount: Int
  }
  static func main() async throws {
    let cases = [
      TestCase(name: "adjacent-paragraph-phrase", body: "<p>The quick</p><p>brown fox.</p>", query: "quick brown", expectedCount: 1),
      TestCase(name: "adjacent-paragraph-false-word", body: "<p>The quick</p><p>brown fox.</p>", query: "quickbrown", expectedCount: 0),
      TestCase(name: "spaced-paragraph-phrase", body: "<p>The quick</p>\n<p>brown fox.</p>", query: "quick brown", expectedCount: 1),
      TestCase(name: "inline-split-word", body: "<p>ca<strong>ter</strong>pillar</p>", query: "caterpillar", expectedCount: 1),
      TestCase(name: "inline-no-false-space", body: "<p>ca<strong>ter</strong>pillar</p>", query: "ca ter", expectedCount: 0),
      TestCase(name: "br-boundary", body: "<p>Fish &amp; chips<br/>fresh &lt;fruit&gt;</p>", query: "chips fresh", expectedCount: 1),
      TestCase(name: "entity-ampersand", body: "<p>Fish &amp; chips<br/>fresh &lt;fruit&gt;</p>", query: "& chips", expectedCount: 1),
      TestCase(name: "entity-angle-brackets", body: "<p>Fish &amp; chips<br/>fresh &lt;fruit&gt;</p>", query: "<fruit>", expectedCount: 1),
      TestCase(name: "entity-no-double-decode", body: "<p>&amp;lt;tag&amp;gt;</p>", query: "&lt;tag&gt;", expectedCount: 1),
      TestCase(name: "numeric-nbsp-is-not-ascii-space", body: "<p>faith&#160;hope</p>", query: "faith hope", expectedCount: 0),
      TestCase(name: "numeric-nbsp-preserved", body: "<p>faith&#160;hope</p>", query: "faith\u{00a0}hope", expectedCount: 1),
      TestCase(name: "html-nbsp-is-not-ascii-space", body: "<p>faith&nbsp;hope</p>", query: "faith hope", expectedCount: 0),
      TestCase(name: "html-nbsp-preserved", body: "<p>faith&nbsp;hope</p>", query: "faith\u{00a0}hope", expectedCount: 1),
      TestCase(name: "undeclared-html-entity", body: "<p>faith&nbsp;hope</p>", query: "hope", expectedCount: 1),
      TestCase(name: "urdu-paragraph-phrase", body: "<p>یہ ایک</p><p>اردو عبارت ہے</p>", query: "ایک اردو", expectedCount: 1),
      TestCase(name: "malformed-urdu", body: "<p>یہ&nbsp;ایک <em>اردو", query: "ایک اردو", expectedCount: 1),
      TestCase(name: "no-match", body: "<p>یہ ایک</p><p>اردو عبارت ہے</p>", query: "nonexistent", expectedCount: 0),
    ]
    for test in cases {
      let html = "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>Metadata</title></head><body>\(test.body)</body></html>"
      let resource = DataResource(string: html)
      let mediaType = MediaType("application/xhtml+xml")!
      let link = Link(href: "chapter.xhtml", mediaType: mediaType)
      let publication = Publication(
        manifest: Manifest(readingOrder: [link]),
        container: SingleResourceContainer(resource: resource, at: AnyURL(string: "chapter.xhtml")!),
        servicesBuilder: .init(search: CommandLine.arguments.contains("--default-extractor")
          ? StringSearchService.makeFactory()
          : StringSearchService.makeFactory(extractorFactory: ReaderSearchContentExtractorFactory()))
      )
      let iterator = try await publication.search(query: test.query).get()
      var count = 0
      while let batch = try await iterator.next().get() {
        count += batch.locators.count
        for locator in batch.locators {
          precondition(locator.href.string == "chapter.xhtml", "Readium locator lost resource")
          precondition(locator.text.highlight != nil, "Readium locator lost highlight")
        }
      }
      precondition(count == test.expectedCount, "\(test.name): expected \(test.expectedCount), received \(count)")
      print("PASS \(test.name): \(count)")
    }
    let factory = ReaderSearchContentExtractorFactory()
    precondition(factory.makeExtractor(for: DataResource(string: ""), mediaType: MediaType("text/plain")!) == nil)
    let failing = FailureResource(error: .decoding(ProbeError.synthetic))
    let extractor = factory.makeExtractor(for: failing, mediaType: MediaType("application/xhtml+xml")!)!
    switch await extractor.extractText(of: failing) {
    case .failure: print("PASS resource-read-failure")
    case .success: preconditionFailure("Read failure was silently converted to empty text")
    }
    print("PASS unsupported-media-type")
  }
  enum ProbeError: Error { case synthetic }
}
