import Foundation
import ReadiumNavigator
import ReadiumShared

enum NativeFontRegistry {
  static func load(bundle: Bundle = .main) -> [NativeFontDefinition] {
    validation(bundle: bundle).fonts
  }

  static func declarations(
    for fonts: [NativeFontDefinition],
    bundle: Bundle = .main
  ) -> [AnyHTMLFontFamilyDeclaration] {
    NativeFontManifestPolicy.group(fonts).compactMap { family in
      var faces: [CSSFontFace] = []
      for font in family.faces {
        guard
          let url = bundle.url(
            forResource: (font.file as NSString).deletingPathExtension,
            withExtension: (font.file as NSString).pathExtension
          ),
          let fileURL = FileURL(url: url)
        else {
          return nil
        }
        faces.append(
          CSSFontFace(
            file: fileURL,
            preload: false,
            style: font.style == "italic" ? .italic : .normal,
            weight: cssWeight(font.weight)
          )
        )
      }
      return CSSFontFamilyDeclaration(
        fontFamily: FontFamily(rawValue: family.family),
        fontFaces: faces
      ).eraseToAnyHTMLFontFamilyDeclaration()
    }
  }

  static func diagnostics(
    bundle: Bundle = .main,
    fonts: [NativeFontDefinition]
  ) -> ReaderFontManifestDiagnostics {
    let validation = validation(bundle: bundle)
    guard validation.status != "valid" || validation.fonts == fonts else {
      return ReaderFontManifestDiagnostics(status: "invalid", faceCount: 0, familyCount: 0)
    }
    return ReaderFontManifestDiagnostics(
      status: validation.status,
      faceCount: validation.faceCount,
      familyCount: validation.familyCount
    )
  }

  private static func validation(bundle: Bundle) -> NativeFontManifestValidation {
    guard let manifestURL = bundle.url(forResource: "NativeEpubKitFonts", withExtension: "json")
    else {
      return NativeFontManifestPolicy.validate(data: nil, platform: .ios) { _ in false }
    }
    let data = (try? Data(contentsOf: manifestURL)) ?? Data()
    return NativeFontManifestPolicy.validate(data: data, platform: .ios) { path in
      bundle.url(
        forResource: (path as NSString).deletingPathExtension,
        withExtension: (path as NSString).pathExtension
      ) != nil
    }
  }

  private static func cssWeight(_ weight: Int) -> CSSFontWeight {
    let standard: [Int: CSSStandardFontWeight] = [
      100: .thin,
      200: .extraLight,
      300: .light,
      400: .normal,
      500: .medium,
      600: .semiBold,
      700: .bold,
      800: .extraBold,
      900: .black,
    ]
    return standard[weight].map(CSSFontWeight.standard) ?? .variable(weight ... weight)
  }
}
