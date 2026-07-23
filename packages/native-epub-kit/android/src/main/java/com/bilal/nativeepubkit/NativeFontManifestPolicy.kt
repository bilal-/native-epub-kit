package com.bilal.nativeepubkit

import java.text.Normalizer
import org.json.JSONObject

internal enum class NativeFontPlatform {
  ANDROID,
  IOS,
}

internal data class NativeFontDefinition(
  val family: String,
  val file: String,
  val path: String,
  val style: String,
  val weight: Int,
)

internal data class NativeFontFamilyDefinition(
  val family: String,
  val faces: List<NativeFontDefinition>,
)

internal data class NativeFontManifestValidation(
  val status: String,
  val fonts: List<NativeFontDefinition>,
  val families: List<NativeFontFamilyDefinition>,
) {
  val faceCount: Int get() = fonts.size
  val familyCount: Int get() = families.size
}

internal object NativeFontManifestPolicy {
  const val SCHEMA_VERSION = 1
  const val MAXIMUM_FACES = 64
  private val ROOT_KEYS = setOf("fonts", "schemaVersion")
  private val FACE_KEYS = setOf("family", "file", "path", "style", "weight")
  private val GENERATED_FILE = Regex("NativeEpubKit-[0-9]+-[A-Za-z0-9_-]+\\.(?:otf|ttf)")

  fun validate(
    manifest: JSONObject?,
    platform: NativeFontPlatform,
    fileAvailable: (String) -> Boolean,
  ): NativeFontManifestValidation {
    if (manifest == null) return empty("not-configured")
    return runCatching {
      require(manifest.keys().asSequence().toSet() == ROOT_KEYS)
      require(exactInteger(manifest.opt("schemaVersion")) == SCHEMA_VERSION)
      val rawFonts = manifest.getJSONArray("fonts")
      require(rawFonts.length() in 1..MAXIMUM_FACES)

      val seenFaces = mutableSetOf<String>()
      val fonts = buildList {
        for (index in 0 until rawFonts.length()) {
          val face = rawFonts.getJSONObject(index)
          require(face.keys().asSequence().toSet() == FACE_KEYS)
          val family = validFamily(face.opt("family"))
          val file = validGeneratedFile(face.opt("file"), index)
          val path = face.opt("path") as? String ?: error("Invalid font path")
          require(path == expectedPath(file, platform))
          require(fileAvailable(path))
          val style = face.opt("style") as? String ?: error("Invalid font style")
          require(style in setOf("normal", "italic"))
          val weight = exactInteger(face.opt("weight")) ?: error("Invalid font weight")
          require(weight in 1..1000)
          require(seenFaces.add("$family\u0000$weight\u0000$style"))
          add(NativeFontDefinition(family, file, path, style, weight))
        }
      }
      NativeFontManifestValidation("valid", fonts, group(fonts))
    }.getOrElse { empty("invalid") }
  }

  fun group(fonts: List<NativeFontDefinition>): List<NativeFontFamilyDefinition> {
    val families = linkedMapOf<String, MutableList<NativeFontDefinition>>()
    for (font in fonts) families.getOrPut(font.family, ::mutableListOf).add(font)
    return families.map { (family, faces) -> NativeFontFamilyDefinition(family, faces.toList()) }
  }

  private fun empty(status: String) = NativeFontManifestValidation(status, emptyList(), emptyList())

  private fun exactInteger(value: Any?): Int? {
    if (value !is Number) return null
    val number = value.toDouble()
    if (!number.isFinite() || number % 1.0 != 0.0 || number !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
      return null
    }
    return number.toInt()
  }

  private fun validFamily(value: Any?): String {
    val family = value as? String ?: error("Invalid font family")
    require(family.isNotEmpty() && family.length <= 128)
    require(family == family.trim())
    require(family == Normalizer.normalize(family, Normalizer.Form.NFC))
    require(family.none { it.code <= 0x1F || it.code == 0x7F })
    return family
  }

  private fun validGeneratedFile(value: Any?, index: Int): String {
    val file = value as? String ?: error("Invalid generated font file")
    require(GENERATED_FILE.matches(file))
    require(file.startsWith("NativeEpubKit-$index-"))
    return file
  }

  private fun expectedPath(file: String, platform: NativeFontPlatform): String =
    if (platform == NativeFontPlatform.ANDROID) "native_epub_kit/fonts/$file" else file
}
