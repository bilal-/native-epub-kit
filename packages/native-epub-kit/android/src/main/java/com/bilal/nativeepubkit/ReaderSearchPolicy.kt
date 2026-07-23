package com.bilal.nativeepubkit

import java.text.Normalizer
import org.json.JSONObject

internal data class ResolvedReaderSearchOptions(
  val caseSensitive: Boolean,
  val diacriticSensitive: Boolean,
  val language: String?,
  val pageSize: Int,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("caseSensitive", caseSensitive)
    .put("diacriticSensitive", diacriticSensitive)
    .put("pageSize", pageSize)
    .also { value -> language?.let { value.put("language", it) } }
}

internal data class ResolvedReaderSearchRequest(
  val options: ResolvedReaderSearchOptions,
  val query: String,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("options", options.toJson())
    .put("query", query)
}

internal data class ResolvedReaderSearchExcerpt(
  val after: String,
  val before: String,
  val highlight: String,
  val truncated: Boolean,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "after" to after,
    "before" to before,
    "highlight" to highlight,
    "truncated" to truncated,
  )
}

internal object ReaderSearchPolicy {
  const val DEFAULT_PAGE_SIZE = 50
  const val MAXIMUM_PAGE_SIZE = 100
  const val MAXIMUM_RESULTS = 2_000
  const val MAXIMUM_QUERY_UTF16_UNITS = 256
  const val MAXIMUM_LANGUAGE_UTF16_UNITS = 64
  const val MAXIMUM_EXCERPT_CONTEXT_UTF16_UNITS = 256
  const val MAXIMUM_EXCERPT_HIGHLIGHT_UTF16_UNITS = 256
  const val MAXIMUM_RESOURCE_TITLE_UTF16_UNITS = 512
  const val MAXIMUM_SESSION_ID_UTF16_UNITS = 128
  const val MAXIMUM_CURSOR_UTF16_UNITS = 128

  val DECORATION_GROUPS = mapOf(
    "current" to "search.current:v1",
    "results" to "search.results:v1",
  )
  val DEFAULT_OPTIONS = ResolvedReaderSearchOptions(
    caseSensitive = false,
    diacriticSensitive = false,
    language = null,
    pageSize = DEFAULT_PAGE_SIZE,
  )

  private val languagePattern = Regex("^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$")
  private val identifierPattern = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]*$")

  fun resolve(query: String, optionsJson: String): ResolvedReaderSearchRequest =
    resolve(query, JSONObject(optionsJson))

  fun resolve(query: String, options: Any?): ResolvedReaderSearchRequest {
    val normalizedQuery = Normalizer.normalize(query, Normalizer.Form.NFC).trim()
    require(normalizedQuery.isNotEmpty() && normalizedQuery.length <= MAXIMUM_QUERY_UTF16_UNITS) {
      "Search query is empty or exceeds the bridge bound"
    }

    val input = when (options) {
      null, JSONObject.NULL -> JSONObject()
      is JSONObject -> options
      else -> throw IllegalArgumentException("Search options must be an object")
    }
    val supported = setOf("caseSensitive", "diacriticSensitive", "language", "pageSize")
    require(input.keys().asSequence().all(supported::contains)) {
      "Search options contain an unsupported field"
    }

    val caseSensitive = input.optionalBoolean("caseSensitive", DEFAULT_OPTIONS.caseSensitive)
    val diacriticSensitive = input.optionalBoolean(
      "diacriticSensitive",
      DEFAULT_OPTIONS.diacriticSensitive,
    )
    val pageSize = input.optionalInteger("pageSize", DEFAULT_PAGE_SIZE)
    require(pageSize in 1..MAXIMUM_PAGE_SIZE) { "Search page size is outside the supported range" }

    val language = if (!input.has("language") || input.isNull("language")) {
      null
    } else {
      val value = input.opt("language") as? String
        ?: throw IllegalArgumentException("Search language must be a string")
      Normalizer.normalize(value, Normalizer.Form.NFC).trim().also {
        require(
          it.isNotEmpty() &&
            it.length <= MAXIMUM_LANGUAGE_UTF16_UNITS &&
            languagePattern.matches(it)
        ) { "Search language is not a bounded BCP 47 tag" }
      }
    }

    return ResolvedReaderSearchRequest(
      options = ResolvedReaderSearchOptions(
        caseSensitive = caseSensitive,
        diacriticSensitive = diacriticSensitive,
        language = language,
        pageSize = pageSize,
      ),
      query = normalizedQuery,
    )
  }

  fun excerpt(before: String, highlight: String, after: String): ResolvedReaderSearchExcerpt {
    val boundedBefore = SelectionTextBounder.boundEnd(before, MAXIMUM_EXCERPT_CONTEXT_UTF16_UNITS)
    val boundedHighlight = SelectionTextBounder.bound(
      highlight,
      MAXIMUM_EXCERPT_HIGHLIGHT_UTF16_UNITS,
    )
    val boundedAfter = SelectionTextBounder.bound(after, MAXIMUM_EXCERPT_CONTEXT_UTF16_UNITS)
    return ResolvedReaderSearchExcerpt(
      after = boundedAfter.text,
      before = boundedBefore.text,
      highlight = boundedHighlight.text,
      truncated = boundedBefore.truncated || boundedHighlight.truncated || boundedAfter.truncated,
    )
  }

  fun resourceTitle(value: String?): String? {
    val normalized = value?.trim()?.takeIf(String::isNotEmpty) ?: return null
    return SelectionTextBounder.bound(normalized, MAXIMUM_RESOURCE_TITLE_UTF16_UNITS).text
  }

  fun validateSessionId(value: String): String =
    validateIdentifier(value, MAXIMUM_SESSION_ID_UTF16_UNITS)

  fun validateCursor(value: String, allowInitialEmpty: Boolean = false): String {
    if (allowInitialEmpty && value.isEmpty()) return value
    return validateIdentifier(value, MAXIMUM_CURSOR_UTF16_UNITS)
  }

  private fun validateIdentifier(value: String, maximumUtf16Units: Int): String {
    require(
      value.isNotEmpty() &&
        value.length <= maximumUtf16Units &&
        identifierPattern.matches(value)
    ) { "Opaque search identifier is invalid" }
    return value
  }

  private fun JSONObject.optionalBoolean(key: String, fallback: Boolean): Boolean {
    if (!has(key) || isNull(key)) return fallback
    return opt(key) as? Boolean
      ?: throw IllegalArgumentException("Search boolean option is invalid")
  }

  private fun JSONObject.optionalInteger(key: String, fallback: Int): Int {
    if (!has(key) || isNull(key)) return fallback
    val number = opt(key) as? Number
      ?: throw IllegalArgumentException("Search integer option is invalid")
    val double = number.toDouble()
    require(double.isFinite() && double % 1.0 == 0.0 && double in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
      "Search integer option is invalid"
    }
    return double.toInt()
  }
}
