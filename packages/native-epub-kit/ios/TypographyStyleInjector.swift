import Foundation

enum TypographyStyleInjector {
  static let marker = "data-native-epub-kit-typography"

  static func supports(path: String) -> Bool {
    let withoutFragment = path.split(separator: "#", maxSplits: 1).first.map(String.init) ?? path
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1).first.map(String.init)
      ?? withoutFragment
    let extensionName = (withoutQuery as NSString).pathExtension.lowercased()
    return ["htm", "html", "xhtml"].contains(extensionName)
  }

  static func inject(_ html: String, profile: ResolvedTypographyProfile) -> String {
    guard profile.publisherStyles.injectsProfileRules, !html.contains(marker) else {
      return html
    }
    guard let headEnd = html.range(of: "</head>", options: .caseInsensitive) else {
      return html
    }

    let style = """
    <style \(marker)="\(profile.publisherStyles.rawValue)">
    \(profile.stylesheet)
    </style>
    """
    var result = html
    result.insert(contentsOf: "\n\(style)\n", at: headEnd.lowerBound)
    return result
  }
}
