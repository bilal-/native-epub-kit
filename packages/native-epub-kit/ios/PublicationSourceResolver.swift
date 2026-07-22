import Foundation

struct PublicationSessionFailure: Error, Equatable, Sendable {
  let stableCode: SharedReaderErrorCode
  let stablePhase: SharedReaderErrorPhase
  let message: String
  let recoverable: Bool

  var code: String { stableCode.rawValue }
  var phase: String { stablePhase.rawValue }
}

struct ResolvedPublicationSource: Equatable, Sendable {
  let kind: SharedPublicationSourceKind
  let retrievalUri: String
  let fileURL: URL?
}

enum PublicationSourceResolver {
  static func resolveLegacyUri(_ value: String) -> Result<ResolvedPublicationSource, PublicationSessionFailure> {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let url = URL(string: trimmed), let scheme = url.scheme?.lowercased()
    else {
      return .failure(unsupported("The publication source URI is invalid."))
    }

    switch scheme {
    case "file":
      return resolveFile(url)
    case "content":
      return .failure(
        unsupported("Android content URIs are not available on Apple platforms.")
      )
    case "http", "https":
      return .failure(remoteUnsupported())
    default:
      return .failure(unsupported("The publication source scheme is unsupported."))
    }
  }

  static func resolve(
    _ record: SharedPublicationSourceRecord
  ) -> Result<ResolvedPublicationSource, PublicationSessionFailure> {
    guard case let .object(object) = record.jsonValue else {
      return .failure(unsupported("The publication source record is invalid."))
    }

    switch record.kind {
    case .file:
      guard
        case let .string(value)? = object["uri"],
        let url = URL(string: value)
      else {
        return .failure(unsupported("The local publication URI is invalid."))
      }
      return resolveFile(url)
    case .content:
      return .failure(
        unsupported("Android content URIs are not available on Apple platforms.")
      )
    case .remote:
      return .failure(remoteUnsupported())
    }
  }

  private static func resolveFile(
    _ url: URL
  ) -> Result<ResolvedPublicationSource, PublicationSessionFailure> {
    guard
      url.isFileURL,
      url.scheme?.lowercased() == "file",
      url.path.hasPrefix("/")
    else {
      return .failure(unsupported("The local publication URI is invalid."))
    }

    let standardizedURL = url.standardizedFileURL
    let startedSecurityScope = standardizedURL.startAccessingSecurityScopedResource()
    defer {
      if startedSecurityScope {
        standardizedURL.stopAccessingSecurityScopedResource()
      }
    }
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(
      atPath: standardizedURL.path,
      isDirectory: &isDirectory
    ) else {
      return .failure(
        PublicationSessionFailure(
          stableCode: .sourceNotFound,
          stablePhase: .source,
          message: "The EPUB file does not exist.",
          recoverable: true
        )
      )
    }

    guard !isDirectory.boolValue else {
      return .failure(unsupported("The source is not a regular EPUB file."))
    }
    guard standardizedURL.pathExtension.lowercased() == "epub" else {
      return .failure(unsupported("Only EPUB files are supported."))
    }
    guard FileManager.default.isReadableFile(atPath: standardizedURL.path) else {
      return .failure(permissionDenied())
    }

    do {
      let handle = try FileHandle(forReadingFrom: standardizedURL)
      try handle.close()
    } catch {
      return .failure(permissionDenied())
    }

    return .success(
      ResolvedPublicationSource(
        kind: .file,
        retrievalUri: standardizedURL.absoluteString,
        fileURL: standardizedURL
      )
    )
  }

  static func unsupported(_ message: String) -> PublicationSessionFailure {
    PublicationSessionFailure(
      stableCode: .unsupportedFormat,
      stablePhase: .source,
      message: message,
      recoverable: true
    )
  }

  static func permissionDenied() -> PublicationSessionFailure {
    PublicationSessionFailure(
      stableCode: .sourcePermissionDenied,
      stablePhase: .source,
      message: "The EPUB file is not readable.",
      recoverable: true
    )
  }

  static func remoteUnsupported() -> PublicationSessionFailure {
    unsupported(
      "Remote publication sources are experimental and disabled in this release."
    )
  }
}
