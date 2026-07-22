import CoreFoundation
import Foundation

enum NativeFontPlatform: String, Decodable, Sendable {
  case android
  case ios
}

struct NativeFontDefinition: Equatable, Sendable {
  let family: String
  let file: String
  let path: String
  let style: String
  let weight: Int
}

struct NativeFontFamilyDefinition: Equatable, Sendable {
  let family: String
  let faces: [NativeFontDefinition]
}

struct NativeFontManifestValidation: Equatable, Sendable {
  let status: String
  let fonts: [NativeFontDefinition]
  let families: [NativeFontFamilyDefinition]

  var faceCount: Int { fonts.count }
  var familyCount: Int { families.count }
}

enum NativeFontManifestPolicy {
  static let schemaVersion = 1
  static let maximumFaces = 64

  static func validate(
    data: Data?,
    platform: NativeFontPlatform,
    fileAvailable: (String) -> Bool
  ) -> NativeFontManifestValidation {
    guard let data else {
      return empty(status: "not-configured")
    }

    do {
      guard
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        Set(root.keys) == ["fonts", "schemaVersion"],
        integer(root["schemaVersion"]) == schemaVersion,
        let rawFonts = root["fonts"] as? [Any],
        (1 ... maximumFaces).contains(rawFonts.count)
      else {
        return empty(status: "invalid")
      }

      var seenFaces = Set<String>()
      var fonts: [NativeFontDefinition] = []
      fonts.reserveCapacity(rawFonts.count)
      for (index, value) in rawFonts.enumerated() {
        guard
          let face = value as? [String: Any],
          Set(face.keys) == ["family", "file", "path", "style", "weight"],
          let familyValue = face["family"] as? String,
          let family = validFamily(familyValue),
          let fileValue = face["file"] as? String,
          let file = validGeneratedFile(fileValue, index: index),
          let path = face["path"] as? String,
          path == expectedPath(file: file, platform: platform),
          fileAvailable(path),
          let style = face["style"] as? String,
          ["normal", "italic"].contains(style),
          let weight = integer(face["weight"]),
          (1 ... 1000).contains(weight)
        else {
          return empty(status: "invalid")
        }
        let faceKey = "\(family)\u{0}\(weight)\u{0}\(style)"
        guard seenFaces.insert(faceKey).inserted else {
          return empty(status: "invalid")
        }
        fonts.append(
          NativeFontDefinition(
            family: family,
            file: file,
            path: path,
            style: style,
            weight: weight
          )
        )
      }

      let families = group(fonts)
      return NativeFontManifestValidation(status: "valid", fonts: fonts, families: families)
    } catch {
      return empty(status: "invalid")
    }
  }

  static func group(_ fonts: [NativeFontDefinition]) -> [NativeFontFamilyDefinition] {
    var families: [NativeFontFamilyDefinition] = []
    var familyIndexes: [String: Int] = [:]
    for font in fonts {
      if let index = familyIndexes[font.family] {
        let current = families[index]
        families[index] = NativeFontFamilyDefinition(
          family: current.family,
          faces: current.faces + [font]
        )
      } else {
        familyIndexes[font.family] = families.count
        families.append(NativeFontFamilyDefinition(family: font.family, faces: [font]))
      }
    }
    return families
  }

  private static func empty(status: String) -> NativeFontManifestValidation {
    NativeFontManifestValidation(status: status, fonts: [], families: [])
  }

  private static func integer(_ value: Any?) -> Int? {
    guard
      let number = value as? NSNumber,
      CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.isFinite,
      number.doubleValue.rounded() == number.doubleValue,
      number.doubleValue >= Double(Int.min),
      number.doubleValue <= Double(Int.max)
    else {
      return nil
    }
    return number.intValue
  }

  private static func validFamily(_ value: String) -> String? {
    guard
      !value.isEmpty,
      value.utf16.count <= 128,
      value == value.trimmingCharacters(in: .whitespacesAndNewlines),
      value == value.precomposedStringWithCanonicalMapping,
      !value.unicodeScalars.contains(where: { $0.value <= 0x1F || $0.value == 0x7F })
    else {
      return nil
    }
    return value
  }

  private static func validGeneratedFile(_ value: String, index: Int) -> String? {
    let prefix = "NativeEpubKit-\(index)-"
    guard value.hasPrefix(prefix) else { return nil }
    let extensionValue: String
    if value.hasSuffix(".ttf") {
      extensionValue = ".ttf"
    } else if value.hasSuffix(".otf") {
      extensionValue = ".otf"
    } else {
      return nil
    }
    let stem = value.dropFirst(prefix.count).dropLast(extensionValue.count)
    guard !stem.isEmpty else { return nil }
    guard stem.allSatisfy({ character in
      character.isASCII && (character.isLetter || character.isNumber || character == "_" || character == "-")
    }) else {
      return nil
    }
    return value
  }

  private static func expectedPath(file: String, platform: NativeFontPlatform) -> String {
    platform == .android ? "native_epub_kit/fonts/\(file)" : file
  }
}
