import Foundation

struct ReaderDiagnosticsPublicationInput: Equatable, Sendable {
  let layout: String
  let readingProgression: String
  let positionCount: Int
  let progressPrecision: String
  let mappingDurationMilliseconds: Int
  let capabilities: [String: Bool]
  let warnings: [String]
}

struct ReaderFontManifestDiagnostics: Equatable, Sendable {
  let status: String
  let faceCount: Int
  let familyCount: Int

  var foundationValue: [String: Any] {
    [
      "faceCount": max(0, faceCount),
      "familyCount": max(0, familyCount),
      "status": status,
    ]
  }
}

enum ReaderDiagnosticsPolicy {
  static let schemaVersion = 1
  static let maximumWarnings = 64
  static let featureNames = [
    "local-file-source",
    "content-uri-source",
    "remote-source",
    "publication-data",
    "positions",
    "navigation",
    "restore",
    "preferences",
    "progress",
    "selection",
    "footnotes",
    "custom-fonts",
    "decorations",
    "images",
    "search",
    "diagnostics",
  ]

  static func payload(
    platform: String,
    sdkVersion: String,
    toolkitName: String,
    toolkitVersion: String,
    toolkitRevision: String,
    generation: Int,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics,
    preferencesStatus: [String: Any]
  ) -> [String: Any] {
    let publicationWarnings = canonicalWarnings(publication.warnings)
    let preferenceWarnings = canonicalWarnings(preferencesStatus["warnings"] as? [String] ?? [])
    return [
      "features": features(platform: platform, publication: publication, fonts: fonts),
      "fonts": fonts.foundationValue,
      "generation": max(0, generation),
      "platform": platform,
      "preferences": [
        "applied": preferencesStatus["applied"] as? [String: Any] ?? [:],
        "requested": preferencesStatus["requested"] as? [String: Any] ?? [:],
        "support": preferencesStatus["support"] as? [[String: Any]] ?? [],
        "warnings": preferenceWarnings,
      ],
      "publication": [
        "format": "epub",
        "layout": publication.layout,
        "mappingDurationMilliseconds": max(0, publication.mappingDurationMilliseconds),
        "positionCount": max(0, publication.positionCount),
        "progressPrecision": publication.progressPrecision,
        "readingProgression": publication.readingProgression,
        "warnings": publicationWarnings,
      ],
      "redaction": ["profile": "support-v1"],
      "schemaVersion": schemaVersion,
      "sdk": ["name": "native-epub-kit", "version": sdkVersion],
      "toolkit": [
        "name": toolkitName,
        "revision": toolkitRevision,
        "version": toolkitVersion,
      ],
      "warnings": canonicalWarnings(
        publicationWarnings + preferenceWarnings
          + (fonts.status == "invalid" ? ["font-manifest-invalid"] : [])
          + ["remote-sources-disabled"]
      ),
    ]
  }

  static func features(
    platform: String,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics
  ) -> [[String: Any]] {
    featureNames.map { name in
      [
        "enabled": featureEnabled(
          name,
          platform: platform,
          publication: publication,
          fonts: fonts
        ),
        "name": name,
        "stage": featureStage(name, platform: platform),
      ]
    }
  }

  static func canonicalWarnings(_ warnings: [String]) -> [String] {
    Array(Set(warnings.filter(validWarning))).sorted().prefix(maximumWarnings).map { $0 }
  }

  private static func featureStage(_ name: String, platform: String) -> String {
    switch name {
    case "content-uri-source": platform == "android" ? "stable" : "unsupported"
    case "remote-source": "unsupported"
    case "custom-fonts": "qualification"
    case "decorations", "search": "stable"
    default: "stable"
    }
  }

  private static func featureEnabled(
    _ name: String,
    platform: String,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics
  ) -> Bool {
    switch name {
    case "content-uri-source": platform == "android"
    case "remote-source": false
    case "positions": publication.capabilities["positions"] == true
    case "selection": publication.capabilities["selection"] == true
    case "footnotes": publication.capabilities["footnotes"] == true
    case "custom-fonts":
      publication.capabilities["customFonts"] == true && fonts.status == "valid"
    case "decorations": publication.capabilities["decorations"] == true
    case "images": publication.capabilities["images"] == true
    case "search": publication.capabilities["search"] == true
    default: true
    }
  }

  private static func validWarning(_ warning: String) -> Bool {
    guard !warning.isEmpty, warning.count <= 64 else { return false }
    let parts = warning.split(separator: "-", omittingEmptySubsequences: false)
    return parts.allSatisfy { part in
      !part.isEmpty && part.allSatisfy { character in
        character.isASCII && (character.isLowercase || character.isNumber)
      }
    }
  }
}
