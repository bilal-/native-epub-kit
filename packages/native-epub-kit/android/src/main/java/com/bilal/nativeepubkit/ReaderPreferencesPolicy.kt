package com.bilal.nativeepubkit

import org.json.JSONObject

internal class ReaderPreferencesValidationException(message: String) :
  IllegalArgumentException(message)

internal enum class ReaderPreferenceName(val wireValue: String) {
  THEME("theme"),
  FONT_SIZE("fontSize"),
  LAYOUT("layout"),
  SPREAD("spread"),
  PAGE_MARGINS("pageMargins"),
  LINE_HEIGHT("lineHeight"),
  TEXT_ALIGNMENT("textAlignment"),
  PUBLISHER_STYLES("publisherStyles"),
  READING_PROGRESSION("readingProgression"),
}

internal data class ResolvedReaderPreferences(
  val theme: String,
  val fontSize: Double,
  val layout: String,
  val spread: String,
  val pageMargins: Double,
  val lineHeight: Double,
  val textAlignment: String,
  val publisherStyles: Boolean,
  val readingProgression: String,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "fontSize" to fontSize,
    "layout" to layout,
    "lineHeight" to lineHeight,
    "pageMargins" to pageMargins,
    "publisherStyles" to publisherStyles,
    "readingProgression" to readingProgression,
    "spread" to spread,
    "textAlignment" to textAlignment,
    "theme" to theme,
  )

  fun value(name: ReaderPreferenceName): Any = requireNotNull(toMap()[name.wireValue])

  companion object {
    val DEFAULTS = ResolvedReaderPreferences(
      theme = "light",
      fontSize = 1.0,
      layout = "scrolled",
      spread = "auto",
      pageMargins = 1.0,
      lineHeight = 1.2,
      textAlignment = "auto",
      publisherStyles = true,
      readingProgression = "auto",
    )

    fun decode(value: Any?): ResolvedReaderPreferences {
      if (value == null) return DEFAULTS
      val objectValue = value as? JSONObject
        ?: throw ReaderPreferencesValidationException("preferences must be an object")
      val allowed = ReaderPreferenceName.entries.map { it.wireValue }.toSet()
      if (objectValue.keys().asSequence().any { it !in allowed }) {
        throw ReaderPreferencesValidationException("preferences contain an unknown field")
      }
      return ResolvedReaderPreferences(
        theme = objectValue.enumValue("theme", "light", setOf("light", "dark", "sepia")),
        fontSize = objectValue.number(
          "fontSize",
          1.0,
          ReaderPreferencesPolicy.FONT_SIZE_RANGE,
        ),
        layout = objectValue.enumValue(
          "layout",
          "scrolled",
          setOf("scrolled", "paginated"),
        ),
        spread = objectValue.enumValue(
          "spread",
          "auto",
          setOf("auto", "never", "always"),
        ),
        pageMargins = objectValue.number(
          "pageMargins",
          1.0,
          ReaderPreferencesPolicy.PAGE_MARGINS_RANGE,
        ),
        lineHeight = objectValue.number(
          "lineHeight",
          1.2,
          ReaderPreferencesPolicy.LINE_HEIGHT_RANGE,
        ),
        textAlignment = objectValue.enumValue(
          "textAlignment",
          "auto",
          setOf("auto", "start", "end", "left", "right", "center", "justify"),
        ),
        publisherStyles = if (objectValue.has("publisherStyles")) {
          objectValue.opt("publisherStyles") as? Boolean
            ?: throw ReaderPreferencesValidationException("publisherStyles must be a boolean")
        } else {
          true
        },
        readingProgression = objectValue.enumValue(
          "readingProgression",
          "auto",
          setOf("auto", "ltr", "rtl"),
        ),
      )
    }
  }
}

internal data class ReaderPreferenceSupport(
  val name: ReaderPreferenceName,
  val supported: Boolean,
  val reason: String?,
) {
  fun toMap(): Map<String, Any> = buildMap {
    put("name", name.wireValue)
    put("supported", supported)
    reason?.let { put("reason", it) }
  }
}

internal data class ReaderPreferencesPolicyResult(
  val appliedNames: List<ReaderPreferenceName>,
  val support: List<ReaderPreferenceSupport>,
  val warnings: List<String>,
) {
  fun appliedMap(preferences: ResolvedReaderPreferences): Map<String, Any> =
    appliedNames.associate { it.wireValue to preferences.value(it) }
}

internal object ReaderPreferencesPolicy {
  val FONT_SIZE_RANGE = 0.1..5.0
  val PAGE_MARGINS_RANGE = 0.0..4.0
  val LINE_HEIGHT_RANGE = 1.0..2.0

  fun resolve(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Boolean,
  ): ReaderPreferencesPolicyResult {
    val support = ReaderPreferenceName.entries.map { name ->
      when {
        fixedLayout -> {
          val supported = name in setOf(
            ReaderPreferenceName.SPREAD,
            ReaderPreferenceName.READING_PROGRESSION,
          )
          ReaderPreferenceSupport(name, supported, if (supported) null else "fixed-layout")
        }
        name == ReaderPreferenceName.SPREAD -> ReaderPreferenceSupport(
          name,
          false,
          "reflowable-layout",
        )
        preferences.publisherStyles && name in setOf(
          ReaderPreferenceName.LINE_HEIGHT,
          ReaderPreferenceName.TEXT_ALIGNMENT,
        ) -> ReaderPreferenceSupport(name, false, "publisher-styles")
        else -> ReaderPreferenceSupport(name, true, null)
      }
    }
    val warnings = when {
      fixedLayout -> listOf("fixed-layout-reflow-preferences-disabled")
      preferences.publisherStyles -> listOf(
        "spread-fixed-layout-only",
        "publisher-styles-disable-advanced-text",
      )
      else -> listOf("spread-fixed-layout-only")
    }
    return ReaderPreferencesPolicyResult(
      appliedNames = support.filter { it.supported }.map { it.name },
      support = support,
      warnings = warnings,
    )
  }

  fun statusPayload(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Boolean,
    instanceId: String,
    generation: Long,
  ): Map<String, Any> {
    val policy = resolve(preferences, fixedLayout)
    return mapOf(
      "applied" to policy.appliedMap(preferences),
      "generation" to generation,
      "instanceId" to instanceId,
      "publicationLayout" to if (fixedLayout) "fixed" else "reflowable",
      "requested" to preferences.toMap(),
      "support" to policy.support.map { it.toMap() },
      "warnings" to policy.warnings,
    )
  }
}

private fun JSONObject.enumValue(
  key: String,
  fallback: String,
  allowed: Set<String>,
): String {
  if (!has(key)) return fallback
  val value = opt(key) as? String
    ?: throw ReaderPreferencesValidationException("$key must be a string")
  if (value !in allowed) throw ReaderPreferencesValidationException("$key is unsupported")
  return value
}

private fun JSONObject.number(
  key: String,
  fallback: Double,
  range: ClosedFloatingPointRange<Double>,
): Double {
  if (!has(key)) return fallback
  val raw = opt(key)
  if (raw is Boolean || raw !is Number) {
    throw ReaderPreferencesValidationException("$key must be a number")
  }
  val value = raw.toDouble()
  if (!value.isFinite() || value !in range) {
    throw ReaderPreferencesValidationException("$key is out of range")
  }
  return value
}
