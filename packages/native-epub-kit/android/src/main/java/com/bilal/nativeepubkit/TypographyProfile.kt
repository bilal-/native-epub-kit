@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import android.content.Context
import java.math.BigDecimal
import java.text.Normalizer
import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.css.FontStyle
import org.readium.r2.navigator.preferences.FontFamily

internal enum class TypographyPublisherStyleMode {
  PRESERVE, HYBRID, OVERRIDE;

  val wireValue: String
    get() = name.lowercase()

  val publisherStyles: Boolean
    get() = this != OVERRIDE

  val injectsProfileRules: Boolean
    get() = this != PRESERVE

  companion object {
    fun fromWireValue(value: String): TypographyPublisherStyleMode? =
      entries.firstOrNull { it.wireValue == value }
  }
}

internal data class TypographyRuleTarget(val kind: String, val value: String)

internal data class ReaderColorProfile(
  val background: String,
  val link: String,
  val text: String,
)

internal data class TypographyRule(
  val target: TypographyRuleTarget,
  val color: String?,
  val fontFamilies: List<String>?,
  val direction: String?,
  val lineHeight: Double?,
  val fontWeight: Int?,
  val borderTop: String? = null,
)

internal data class ResolvedTypographyProfile(
  val publisherStyles: TypographyPublisherStyleMode,
  val colors: ReaderColorProfile?,
  val defaultFontFamilies: List<String>,
  val rules: List<TypographyRule>,
) {
  val stylesheet: String get() = TypographyProfilePolicy.stylesheet(this)
}

internal data class TypographyProfileValidation(
  val status: String,
  val profile: ResolvedTypographyProfile?,
  val stylesheet: String,
)

internal object TypographyProfilePolicy {
  const val MAXIMUM_RULES = 32
  const val MAXIMUM_FONT_FAMILIES = 8
  const val MINIMUM_LINE_HEIGHT = 0.5
  const val MAXIMUM_LINE_HEIGHT = 4.0
  const val MINIMUM_FONT_WEIGHT = 1
  const val MAXIMUM_FONT_WEIGHT = 1000

  private val PROFILE_KEYS = setOf("colors", "defaultFontFamilies", "publisherStyles", "rules")
  private val COLOR_KEYS = setOf("background", "link", "text")
  private val RULE_KEYS = setOf("borderTop", "color", "direction", "fontFamilies", "fontWeight", "lineHeight", "target")
  private val TARGET_KEYS = setOf("kind", "value")
  private val GENERIC_FAMILIES = setOf(
    "cursive", "fantasy", "monospace", "sans-serif", "serif", "system-ui"
  )
  private val LANGUAGE = Regex("[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*")
  private val CLASS = Regex("[_A-Za-z][_A-Za-z0-9-]*")
  private val COLOR = Regex("#[0-9A-Fa-f]{6}")

  fun validate(
    value: Any?,
    availableFontFamilies: Set<String>? = null,
  ): TypographyProfileValidation {
    if (value == null || value == JSONObject.NULL) return empty("absent")
    return runCatching {
      val profile = resolve(value as JSONObject, availableFontFamilies)
      TypographyProfileValidation("valid", profile, stylesheet(profile))
    }.getOrElse { empty("invalid") }
  }

  fun resolve(
    value: JSONObject,
    availableFontFamilies: Set<String>? = null,
  ): ResolvedTypographyProfile {
    require(value.keys().asSequence().toSet().all(PROFILE_KEYS::contains))
    val mode = (value.opt("publisherStyles") as? String)
      ?.let(TypographyPublisherStyleMode::fromWireValue)
      ?: error("Invalid typography publisherStyles")
    val defaultFontFamilies = readFontFamilies(
      value.opt("defaultFontFamilies"),
      allowEmpty = true,
      availableFontFamilies = availableFontFamilies,
    )
    val rawRules = when (val raw = value.opt("rules")) {
      null, JSONObject.NULL -> JSONArray()
      is JSONArray -> raw
      else -> error("Invalid typography rules")
    }
    require(rawRules.length() <= MAXIMUM_RULES)
    val rules = (0 until rawRules.length()).map { index ->
      resolveRule(rawRules.getJSONObject(index), availableFontFamilies)
    }
    val colors = if (value.has("colors")) resolveColors(value.getJSONObject("colors")) else null
    return ResolvedTypographyProfile(mode, colors, defaultFontFamilies, rules)
  }

  fun stylesheet(profile: ResolvedTypographyProfile): String {
    if (!profile.publisherStyles.injectsProfileRules) return ""
    val lines = mutableListOf<String>()
    profile.colors?.let { colors ->
      lines += ":root, body { background-color: ${colors.background} !important; color: ${colors.text} !important; }"
      lines += ":root a:link:link:link, :root a:link:link:link *, :root a:visited:visited:visited, :root a:visited:visited:visited * { color: ${colors.link} !important; }"
    }
    if (
      profile.publisherStyles == TypographyPublisherStyleMode.OVERRIDE &&
      profile.defaultFontFamilies.isNotEmpty()
    ) {
      lines += ":root, body, body * { font-family: ${fontFamilyList(profile.defaultFontFamilies)} !important; }"
    }
    for (rule in profile.rules) {
      val declarations = mutableListOf<String>()
      val families = rule.fontFamilies ?: profile.defaultFontFamilies
      if (families.isNotEmpty()) {
        declarations += "font-family: ${fontFamilyList(families)} !important;"
      }
      rule.color?.let { declarations += "color: $it !important;" }
      rule.direction?.let { declarations += "direction: $it !important;" }
      rule.lineHeight?.let { declarations += "line-height: ${formatNumber(it)} !important;" }
      rule.fontWeight?.let { declarations += "font-weight: $it !important;" }
      rule.borderTop?.let { declarations += "border-top: none !important;" }
      lines += "${selector(rule.target)} { ${declarations.joinToString(" ")} }"
    }
    return lines.joinToString("\n")
  }

  private fun resolveRule(
    value: JSONObject,
    availableFontFamilies: Set<String>?,
  ): TypographyRule {
    require(value.keys().asSequence().toSet().all(RULE_KEYS::contains))
    val target = resolveTarget(value.getJSONObject("target"))
    val color = if (value.has("color")) normalizeColor(value.opt("color")) else null
    val fontFamilies = if (value.has("fontFamilies")) {
      readFontFamilies(
        value.opt("fontFamilies"),
        allowEmpty = false,
        availableFontFamilies = availableFontFamilies,
      )
    } else {
      null
    }
    val direction = if (value.has("direction")) {
      (value.opt("direction") as? String)?.takeIf { it == "ltr" || it == "rtl" }
        ?: error("Invalid typography direction")
    } else {
      null
    }
    val lineHeight = if (value.has("lineHeight")) {
      exactNumber(value.opt("lineHeight")).also {
        require(it in MINIMUM_LINE_HEIGHT..MAXIMUM_LINE_HEIGHT)
      }
    } else {
      null
    }
    val fontWeight = if (value.has("fontWeight")) {
      exactNumber(value.opt("fontWeight")).also { require(it % 1.0 == 0.0) }.toInt().also {
        require(it in MINIMUM_FONT_WEIGHT..MAXIMUM_FONT_WEIGHT)
      }
    } else {
      null
    }
    val borderTop = if (value.has("borderTop")) {
      (value.opt("borderTop") as? String)?.takeIf { it == "none" }
        ?: error("Invalid typography borderTop")
    } else {
      null
    }
    require(
      color != null || fontFamilies != null || direction != null ||
        lineHeight != null || fontWeight != null || borderTop != null
    )
    return TypographyRule(target, color, fontFamilies, direction, lineHeight, fontWeight, borderTop)
  }

  private fun resolveColors(value: JSONObject): ReaderColorProfile {
    require(value.keys().asSequence().toSet() == COLOR_KEYS)
    return ReaderColorProfile(
      background = normalizeColor(value.opt("background")),
      link = normalizeColor(value.opt("link")),
      text = normalizeColor(value.opt("text")),
    )
  }

  private fun normalizeColor(value: Any?): String {
    require(value is String && COLOR.matches(value))
    return value.uppercase()
  }

  private fun resolveTarget(value: JSONObject): TypographyRuleTarget {
    require(value.keys().asSequence().toSet() == TARGET_KEYS)
    val kind = value.opt("kind") as? String ?: error("Invalid typography target kind")
    val rawValue = value.opt("value") as? String ?: error("Invalid typography target value")
    return when (kind) {
      "language" -> {
        require(rawValue.length <= 63 && LANGUAGE.matches(rawValue))
        TypographyRuleTarget(kind, rawValue.lowercase())
      }
      "direction" -> {
        require(rawValue == "ltr" || rawValue == "rtl")
        TypographyRuleTarget(kind, rawValue)
      }
      "class" -> {
        require(rawValue.length <= 64 && CLASS.matches(rawValue))
        TypographyRuleTarget(kind, rawValue)
      }
      else -> error("Invalid typography target kind")
    }
  }

  private fun readFontFamilies(
    value: Any?,
    allowEmpty: Boolean,
    availableFontFamilies: Set<String>?,
  ): List<String> {
    if (value == null || value == JSONObject.NULL) return emptyList()
    val values = value as? JSONArray ?: error("Invalid typography font families")
    require(values.length() <= MAXIMUM_FONT_FAMILIES)
    require(allowEmpty || values.length() > 0)
    val seen = mutableSetOf<String>()
    return (0 until values.length()).map { index ->
      val family = values.opt(index) as? String ?: error("Invalid typography font family")
      require(validFamily(family) && seen.add(family))
      require(
        availableFontFamilies == null ||
          family in GENERIC_FAMILIES ||
          family in availableFontFamilies
      )
      family
    }
  }

  private fun validFamily(value: String): Boolean =
    value.isNotEmpty() &&
      value.length <= 128 &&
      value == value.trim() &&
      value == Normalizer.normalize(value, Normalizer.Form.NFC) &&
      value.none { it.code <= 0x1F || it.code == 0x7F }

  private fun exactNumber(value: Any?): Double {
    require(value is Number)
    return value.toDouble().also { require(it.isFinite()) }
  }

  private fun selector(target: TypographyRuleTarget): String = when (target.kind) {
    "language" -> ":root :lang(${target.value}):lang(${target.value}), :root [lang|=\"${target.value}\"][lang|=\"${target.value}\"]"
    "direction" -> ":root :dir(${target.value}):dir(${target.value}), :root [dir=\"${target.value}\"][dir=\"${target.value}\"]"
    else -> ":root .${target.value}.${target.value}"
  }

  private fun fontFamilyList(families: List<String>): String = families.joinToString(", ") { family ->
    if (family in GENERIC_FAMILIES) family
    else "\"${family.replace("\\", "\\\\").replace("\"", "\\\"")}\""
  }

  private fun formatNumber(value: Double): String =
    BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()

  private fun empty(status: String) = TypographyProfileValidation(status, null, "")
}

internal object TypographyStyleInjector {
  const val MARKER = "data-native-epub-kit-typography"

  fun supports(path: String): Boolean =
    path.substringBefore('#').substringBefore('?')
      .substringAfterLast('.', missingDelimiterValue = "")
      .lowercase() in setOf("htm", "html", "xhtml")

  fun inject(html: String, profile: ResolvedTypographyProfile): String {
    if (!profile.publisherStyles.injectsProfileRules || MARKER in html) return html
    val headEnd = html.indexOf("</head>", ignoreCase = true)
    if (headEnd == -1) return html

    val style = """
      <style $MARKER="${profile.publisherStyles.wireValue}">
      ${profile.stylesheet}
      </style>
    """.trimIndent()
    return html.substring(0, headEnd) + "\n$style\n" + html.substring(headEnd)
  }
}

internal object NativeFontRegistry {
  private const val MANIFEST_PATH = "native_epub_kit/fonts.json"
  private const val FONT_PATH_PREFIX = "native_epub_kit/fonts/"

  fun load(context: Context): List<NativeFontDefinition> = validation(context).fonts

  fun configure(
    configuration: EpubNavigatorFragment.Configuration,
    fonts: List<NativeFontDefinition>,
  ) {
    if (fonts.isEmpty()) return
    configuration.servedAssets = configuration.servedAssets + "$FONT_PATH_PREFIX.*"
    for (family in NativeFontManifestPolicy.group(fonts)) {
      configuration.addFontFamilyDeclaration(FontFamily(family.family)) {
        for (font in family.faces) {
          addFontFace {
            addSource(font.path, preload = false)
            setFontStyle(if (font.style == "italic") FontStyle.ITALIC else FontStyle.NORMAL)
            setFontWeight(font.weight..font.weight)
          }
        }
      }
    }
  }

  fun diagnostics(
    context: Context,
    fonts: List<NativeFontDefinition>,
  ): ReaderFontManifestDiagnostics {
    val validation = validation(context)
    val status = if (validation.status == "valid" && validation.fonts != fonts) {
      "invalid"
    } else {
      validation.status
    }
    return ReaderFontManifestDiagnostics(
      status = status,
      faceCount = if (status == "valid") validation.faceCount else 0,
      familyCount = if (status == "valid") validation.familyCount else 0,
    )
  }

  private fun validation(context: Context): NativeFontManifestValidation {
    val manifestConfigured = runCatching {
      context.assets.list("native_epub_kit")?.contains("fonts.json") == true
    }.getOrDefault(false)
    if (!manifestConfigured) {
      return NativeFontManifestPolicy.validate(null, NativeFontPlatform.ANDROID) { false }
    }
    val manifest = runCatching {
      context.assets.open(MANIFEST_PATH).bufferedReader().use { JSONObject(it.readText()) }
    }.getOrNull()
    if (manifest == null) return NativeFontManifestValidation("invalid", emptyList(), emptyList())
    return NativeFontManifestPolicy.validate(manifest, NativeFontPlatform.ANDROID) { path ->
      runCatching { context.assets.open(path).use { } }.isSuccess
    }
  }
}
