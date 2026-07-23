package com.bilal.nativeepubkit

internal data class ReaderDiagnosticsPublicationInput(
  val layout: String,
  val readingProgression: String,
  val positionCount: Int,
  val progressPrecision: String,
  val mappingDurationMilliseconds: Long,
  val capabilities: Map<String, Boolean>,
  val warnings: List<String>,
)

internal data class ReaderFontManifestDiagnostics(
  val status: String,
  val faceCount: Int,
  val familyCount: Int,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "faceCount" to faceCount.coerceAtLeast(0),
    "familyCount" to familyCount.coerceAtLeast(0),
    "status" to status,
  )
}

internal object ReaderDiagnosticsPolicy {
  const val SCHEMA_VERSION = 1
  const val MAXIMUM_WARNINGS = 64
  val FEATURE_NAMES = listOf(
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
  )

  fun payload(
    platform: String,
    sdkVersion: String,
    toolkitName: String,
    toolkitVersion: String,
    toolkitRevision: String,
    generation: Long,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics,
    preferencesStatus: Map<String, Any>,
  ): Map<String, Any> {
    val publicationWarnings = canonicalWarnings(publication.warnings)
    val preferenceWarnings = canonicalWarnings(stringList(preferencesStatus["warnings"]))
    return mapOf(
      "features" to features(platform, publication, fonts),
      "fonts" to fonts.toMap(),
      "generation" to generation.coerceAtLeast(0),
      "platform" to platform,
      "preferences" to mapOf(
        "applied" to (preferencesStatus["applied"] ?: emptyMap<String, Any>()),
        "requested" to (preferencesStatus["requested"] ?: emptyMap<String, Any>()),
        "support" to (preferencesStatus["support"] ?: emptyList<Map<String, Any>>()),
        "warnings" to preferenceWarnings,
      ),
      "publication" to mapOf(
        "format" to "epub",
        "layout" to publication.layout,
        "mappingDurationMilliseconds" to publication.mappingDurationMilliseconds.coerceAtLeast(0),
        "positionCount" to publication.positionCount.coerceAtLeast(0),
        "progressPrecision" to publication.progressPrecision,
        "readingProgression" to publication.readingProgression,
        "warnings" to publicationWarnings,
      ),
      "redaction" to mapOf("profile" to "support-v1"),
      "schemaVersion" to SCHEMA_VERSION,
      "sdk" to mapOf("name" to "native-epub-kit", "version" to sdkVersion),
      "toolkit" to mapOf(
        "name" to toolkitName,
        "revision" to toolkitRevision,
        "version" to toolkitVersion,
      ),
      "warnings" to canonicalWarnings(
        publicationWarnings + preferenceWarnings +
          (if (fonts.status == "invalid") listOf("font-manifest-invalid") else emptyList()) +
          "remote-sources-disabled"
      ),
    )
  }

  fun features(
    platform: String,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics,
  ): List<Map<String, Any>> = FEATURE_NAMES.map { name ->
    mapOf(
      "enabled" to featureEnabled(name, platform, publication, fonts),
      "name" to name,
      "stage" to featureStage(name, platform),
    )
  }

  fun canonicalWarnings(warnings: List<String>): List<String> =
    warnings.filter(::validWarning).distinct().sorted().take(MAXIMUM_WARNINGS)

  private fun featureStage(name: String, platform: String): String = when (name) {
    "content-uri-source" -> if (platform == "android") "stable" else "unsupported"
    "remote-source" -> "unsupported"
    "custom-fonts" -> "qualification"
    "decorations", "search" -> "stable"
    else -> "stable"
  }

  private fun featureEnabled(
    name: String,
    platform: String,
    publication: ReaderDiagnosticsPublicationInput,
    fonts: ReaderFontManifestDiagnostics,
  ): Boolean = when (name) {
    "content-uri-source" -> platform == "android"
    "remote-source" -> false
    "positions" -> publication.capabilities["positions"] == true
    "selection" -> publication.capabilities["selection"] == true
    "footnotes" -> publication.capabilities["footnotes"] == true
    "custom-fonts" -> publication.capabilities["customFonts"] == true && fonts.status == "valid"
    "decorations" -> publication.capabilities["decorations"] == true
    "images" -> publication.capabilities["images"] == true
    "search" -> publication.capabilities["search"] == true
    else -> true
  }

  private fun validWarning(warning: String): Boolean =
    warning.length in 1..64 && warning.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*"))

  private fun stringList(value: Any?): List<String> =
    (value as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
}
