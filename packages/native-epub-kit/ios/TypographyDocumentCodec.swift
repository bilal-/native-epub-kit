import Foundation

struct TypographyDocumentInjectionResult: Sendable {
  let data: Data
  let encoding: String?
  let status: String
}

/** Preserves the byte encoding of supported HTML/XHTML resources during injection. */
enum TypographyDocumentCodec {
  static func inject(
    _ data: Data,
    profile: ResolvedTypographyProfile
  ) -> TypographyDocumentInjectionResult {
    guard let decoded = decode(data) else {
      return TypographyDocumentInjectionResult(data: data, encoding: nil, status: "invalid-text")
    }
    guard declarationIsSupported(decoded.text, detected: decoded.encoding) else {
      return TypographyDocumentInjectionResult(
        data: data,
        encoding: decoded.encoding.rawValue,
        status: "unsupported-encoding"
      )
    }
    if decoded.text.contains(TypographyStyleInjector.marker) {
      return TypographyDocumentInjectionResult(
        data: data,
        encoding: decoded.encoding.rawValue,
        status: "already-injected"
      )
    }
    let injected = TypographyStyleInjector.inject(decoded.text, profile: profile)
    guard injected != decoded.text else {
      return TypographyDocumentInjectionResult(
        data: data,
        encoding: decoded.encoding.rawValue,
        status: "no-head"
      )
    }
    guard var encoded = injected.data(using: decoded.encoding.foundationEncoding) else {
      return TypographyDocumentInjectionResult(
        data: data,
        encoding: decoded.encoding.rawValue,
        status: "invalid-text"
      )
    }
    if decoded.hadByteOrderMark {
      encoded.insert(contentsOf: decoded.encoding.byteOrderMark, at: 0)
    }
    return TypographyDocumentInjectionResult(
      data: encoded,
      encoding: decoded.encoding.rawValue,
      status: "injected"
    )
  }

  private static func decode(_ data: Data) -> DecodedDocument? {
    let bytes = [UInt8](data)
    let encoding: SupportedEncoding
    let bomLength: Int
    if bytes.starts(with: SupportedEncoding.utf8.byteOrderMark) {
      encoding = .utf8
      bomLength = 3
    } else if bytes.starts(with: SupportedEncoding.utf16LittleEndian.byteOrderMark) {
      encoding = .utf16LittleEndian
      bomLength = 2
    } else if bytes.starts(with: SupportedEncoding.utf16BigEndian.byteOrderMark) {
      encoding = .utf16BigEndian
      bomLength = 2
    } else if bytes.count >= 4, bytes[0] == 0x3C, bytes[1] == 0, bytes[2] == 0x3F,
      bytes[3] == 0
    {
      encoding = .utf16LittleEndian
      bomLength = 0
    } else if bytes.count >= 4, bytes[0] == 0, bytes[1] == 0x3C, bytes[2] == 0,
      bytes[3] == 0x3F
    {
      encoding = .utf16BigEndian
      bomLength = 0
    } else {
      encoding = .utf8
      bomLength = 0
    }
    let payload = data.dropFirst(bomLength)
    guard let text = String(data: payload, encoding: encoding.foundationEncoding) else {
      return nil
    }
    return DecodedDocument(text: text, encoding: encoding, hadByteOrderMark: bomLength > 0)
  }

  private static func declarationIsSupported(
    _ text: String,
    detected: SupportedEncoding
  ) -> Bool {
    let prefix = String(text.prefix(512))
    let pattern = #"(?i)<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']"#
    guard
      let expression = try? NSRegularExpression(pattern: pattern),
      let match = expression.firstMatch(
        in: prefix,
        range: NSRange(prefix.startIndex..., in: prefix)
      ),
      let range = Range(match.range(at: 1), in: prefix)
    else {
      return true
    }
    switch prefix[range].lowercased().replacingOccurrences(of: "_", with: "-") {
    case "utf-8", "utf8":
      return detected == .utf8
    case "utf-16", "utf16":
      return detected != .utf8
    case "utf-16le", "utf16le":
      return detected == .utf16LittleEndian
    case "utf-16be", "utf16be":
      return detected == .utf16BigEndian
    default:
      return false
    }
  }

  private struct DecodedDocument {
    let text: String
    let encoding: SupportedEncoding
    let hadByteOrderMark: Bool
  }

  private enum SupportedEncoding: String {
    case utf8 = "utf-8"
    case utf16LittleEndian = "utf-16le"
    case utf16BigEndian = "utf-16be"

    var foundationEncoding: String.Encoding {
      switch self {
      case .utf8: .utf8
      case .utf16LittleEndian: .utf16LittleEndian
      case .utf16BigEndian: .utf16BigEndian
      }
    }

    var byteOrderMark: [UInt8] {
      switch self {
      case .utf8: [0xEF, 0xBB, 0xBF]
      case .utf16LittleEndian: [0xFF, 0xFE]
      case .utf16BigEndian: [0xFE, 0xFF]
      }
    }
  }
}
