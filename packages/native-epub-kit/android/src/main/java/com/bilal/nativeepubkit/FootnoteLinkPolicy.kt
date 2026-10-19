package com.bilal.nativeepubkit

import java.text.Normalizer
import java.util.Locale
import java.util.regex.Matcher
import java.util.regex.Pattern
import org.json.JSONArray
import org.json.JSONObject

internal enum class FootnotePolicyMode(val wireValue: String) {
  NAVIGATE("navigate"),
  SEMANTIC("semantic"),
  SEMANTIC_AND_HEURISTIC("semantic-and-heuristic");

  companion object {
    fun from(value: String): FootnotePolicyMode? = entries.firstOrNull { it.wireValue == value }
  }
}

internal data class FootnoteHeuristicRule(
  val id: String,
  val fragmentPrefix: String? = null,
  val fragmentSuffix: String? = null,
  val resourceSuffix: String? = null,
) {
  fun toJson(): JSONObject = JSONObject().put("id", id).apply {
    fragmentPrefix?.let { put("fragmentPrefix", it) }
    fragmentSuffix?.let { put("fragmentSuffix", it) }
    resourceSuffix?.let { put("resourceSuffix", it) }
  }
}

internal data class ResolvedFootnotePolicy(
  val mode: FootnotePolicyMode,
  val heuristicRules: List<FootnoteHeuristicRule>,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("heuristicRules", JSONArray(heuristicRules.map { it.toJson() }))
    .put("mode", mode.wireValue)
}

internal enum class ExternalLinkPolicy(val wireValue: String) {
  INTERCEPT("intercept"),
  BLOCK("block");

  companion object {
    fun from(value: String): ExternalLinkPolicy? = entries.firstOrNull { it.wireValue == value }
  }
}

internal enum class UnsupportedSchemePolicy(val wireValue: String) {
  INTERCEPT("intercept"),
  BLOCK("block");

  companion object {
    fun from(value: String): UnsupportedSchemePolicy? =
      entries.firstOrNull { it.wireValue == value }
  }
}

internal data class ResolvedReaderLinkPolicy(
  val allowedExternalSchemes: List<String>,
  val externalLinks: ExternalLinkPolicy,
  val unsupportedSchemes: UnsupportedSchemePolicy,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("allowedExternalSchemes", JSONArray(allowedExternalSchemes))
    .put("externalLinks", externalLinks.wireValue)
    .put("unsupportedSchemes", unsupportedSchemes.wireValue)
}

internal data class InternalFootnoteDecision(
  val decision: String,
  val classification: String? = null,
  val ruleId: String? = null,
) {
  fun toJson(): JSONObject = JSONObject().put("decision", decision).apply {
    classification?.let { put("classification", it) }
    ruleId?.let { put("ruleId", it) }
  }
}

internal data class ExternalReaderLinkDecision(
  val kind: String,
  val disposition: String,
  val scheme: String? = null,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("disposition", disposition)
    .put("kind", kind)
    .apply { scheme?.let { put("scheme", it) } }
}

internal object FootnoteLinkPolicy {
  const val MAXIMUM_HEURISTIC_RULES = 16
  const val MAXIMUM_EXTERNAL_SCHEMES = 16
  const val MAXIMUM_MATCH_VALUE_UTF16_UNITS = 128

  val DEFAULT_FOOTNOTE = ResolvedFootnotePolicy(FootnotePolicyMode.SEMANTIC, emptyList())
  val DEFAULT_LINKS = ResolvedReaderLinkPolicy(
    allowedExternalSchemes = listOf("http", "https"),
    externalLinks = ExternalLinkPolicy.INTERCEPT,
    unsupportedSchemes = UnsupportedSchemePolicy.BLOCK,
  )

  fun resolveFootnote(json: String?): ResolvedFootnotePolicy =
    if (json == null) DEFAULT_FOOTNOTE else resolveFootnote(JSONObject(json))

  fun resolveFootnote(value: Any?): ResolvedFootnotePolicy {
    if (value == null || value == JSONObject.NULL) return DEFAULT_FOOTNOTE
    val input = value as? JSONObject ?: throw IllegalArgumentException("Invalid footnote policy")
    exactKeys(input, setOf("heuristicRules", "mode"))
    val mode = FootnotePolicyMode.from(input.optString("mode", ""))
      ?: throw IllegalArgumentException("Invalid footnote mode")
    val rawRules = input.opt("heuristicRules") ?: JSONArray()
    val rules = rawRules as? JSONArray ?: throw IllegalArgumentException("Invalid heuristic rules")
    require(rules.length() <= MAXIMUM_HEURISTIC_RULES)
    val resolved = (0 until rules.length()).map { resolveRule(rules.get(it)) }
    require(resolved.map { it.id }.toSet().size == resolved.size)
    return ResolvedFootnotePolicy(mode, resolved)
  }

  fun resolveLinks(json: String?): ResolvedReaderLinkPolicy =
    if (json == null) DEFAULT_LINKS else resolveLinks(JSONObject(json))

  fun resolveLinks(value: Any?): ResolvedReaderLinkPolicy {
    if (value == null || value == JSONObject.NULL) return DEFAULT_LINKS
    val input = value as? JSONObject ?: throw IllegalArgumentException("Invalid link policy")
    exactKeys(input, setOf("allowedExternalSchemes", "externalLinks", "unsupportedSchemes"))
    val rawSchemes = input.opt("allowedExternalSchemes")
      ?: JSONArray(DEFAULT_LINKS.allowedExternalSchemes)
    val schemes = rawSchemes as? JSONArray ?: throw IllegalArgumentException("Invalid schemes")
    require(schemes.length() <= MAXIMUM_EXTERNAL_SCHEMES)
    val normalized = (0 until schemes.length()).map { normalizeScheme(schemes.get(it)) }
    require(normalized.toSet().size == normalized.size)
    val external = ExternalLinkPolicy.from(
      input.optString("externalLinks", DEFAULT_LINKS.externalLinks.wireValue)
    ) ?: throw IllegalArgumentException("Invalid external link policy")
    val unsupported = UnsupportedSchemePolicy.from(
      input.optString("unsupportedSchemes", DEFAULT_LINKS.unsupportedSchemes.wireValue)
    ) ?: throw IllegalArgumentException("Invalid unsupported scheme policy")
    return ResolvedReaderLinkPolicy(normalized, external, unsupported)
  }

  fun decideInternal(
    policy: ResolvedFootnotePolicy,
    href: String,
    semantic: Boolean,
  ): InternalFootnoteDecision {
    if (policy.mode == FootnotePolicyMode.NAVIGATE) return InternalFootnoteDecision("navigate")
    if (semantic) return InternalFootnoteDecision("emit", "semantic")
    if (policy.mode != FootnotePolicyMode.SEMANTIC_AND_HEURISTIC) {
      return InternalFootnoteDecision("navigate")
    }
    val parts = hrefParts(href)
    policy.heuristicRules.firstOrNull { matches(it, parts) }?.let {
      return InternalFootnoteDecision("emit", "heuristic", it.id)
    }
    return if (conservativeHeuristic(parts)) {
      InternalFootnoteDecision("emit", "heuristic")
    } else {
      InternalFootnoteDecision("navigate")
    }
  }

  fun decideExternal(
    policy: ResolvedReaderLinkPolicy,
    href: String,
  ): ExternalReaderLinkDecision {
    val separator = href.indexOf(':')
    val scheme = if (separator <= 0) null else href.substring(0, separator).lowercase(Locale.ROOT)
    if (scheme != null && scheme in policy.allowedExternalSchemes) {
      return ExternalReaderLinkDecision(
        kind = "external",
        disposition = if (policy.externalLinks == ExternalLinkPolicy.INTERCEPT) {
          "intercepted"
        } else {
          "blocked"
        },
        scheme = scheme,
      )
    }
    return ExternalReaderLinkDecision(
      kind = "unsupported",
      disposition = if (policy.unsupportedSchemes == UnsupportedSchemePolicy.INTERCEPT) {
        "intercepted"
      } else {
        "blocked"
      },
      scheme = scheme,
    )
  }

  private fun resolveRule(value: Any): FootnoteHeuristicRule {
    val input = value as? JSONObject ?: throw IllegalArgumentException("Invalid heuristic rule")
    exactKeys(input, setOf("fragmentPrefix", "fragmentSuffix", "id", "resourceSuffix"))
    val fragmentPrefix = optionalMatchValue(input.opt("fragmentPrefix"))
    val fragmentSuffix = optionalMatchValue(input.opt("fragmentSuffix"))
    val resourceSuffix = optionalMatchValue(input.opt("resourceSuffix"))
    require(fragmentPrefix != null || fragmentSuffix != null || resourceSuffix != null)
    return FootnoteHeuristicRule(
      id = matchValue(input.opt("id")),
      fragmentPrefix = fragmentPrefix,
      fragmentSuffix = fragmentSuffix,
      resourceSuffix = resourceSuffix,
    )
  }

  private fun exactKeys(input: JSONObject, allowed: Set<String>) {
    require(input.keys().asSequence().all { it in allowed })
  }

  private fun optionalMatchValue(value: Any?): String? =
    if (value == null || value == JSONObject.NULL) null else matchValue(value)

  private fun matchValue(value: Any?): String {
    val text = value as? String ?: throw IllegalArgumentException("Invalid match value")
    val normalized = Normalizer.normalize(text, Normalizer.Form.NFC).trim()
    require(normalized.isNotEmpty() && normalized.length <= MAXIMUM_MATCH_VALUE_UTF16_UNITS)
    require(normalized.none { Character.isISOControl(it) })
    return normalized
  }

  private fun normalizeScheme(value: Any): String {
    val scheme = (value as? String)?.trim()?.lowercase(Locale.ROOT)
      ?: throw IllegalArgumentException("Invalid scheme")
    require(Regex("^[a-z][a-z0-9+.-]{0,31}$").matches(scheme))
    return scheme
  }

  private data class HrefParts(val fragment: String, val resource: String)

  private fun hrefParts(href: String): HrefParts {
    val fragment = href.substringAfter('#', "")
    val resource = href.substringBefore('#').substringBefore('?')
    return HrefParts(fragment, resource)
  }

  private fun matches(rule: FootnoteHeuristicRule, parts: HrefParts): Boolean =
    (rule.fragmentPrefix == null || parts.fragment.startsWith(rule.fragmentPrefix)) &&
      (rule.fragmentSuffix == null || parts.fragment.endsWith(rule.fragmentSuffix)) &&
      (rule.resourceSuffix == null || parts.resource.endsWith(rule.resourceSuffix))

  private fun conservativeHeuristic(parts: HrefParts): Boolean {
    if (parts.fragment.isEmpty() || parts.resource.isEmpty()) return false
    val resourceName = parts.resource.substringAfterLast('/')
    return Regex("^(?:foot[-_.]?)?notes?(?:[-_.].*)?$", RegexOption.IGNORE_CASE)
      .matches(resourceName) &&
      Regex("^(?:fn|footnote|note)(?:[-_.:]|\\d)", RegexOption.IGNORE_CASE)
        .containsMatchIn(parts.fragment)
  }

  /**
   * Returns the HTML a footnote link targets. Notes whose id element is empty,
   * such as `<a id="note"></a><p>text</p>` from page-layout exports, resolve to
   * the content that immediately follows the anchor.
   */
  fun targetHtml(document: String, fragment: String): String {
    if (fragment.isEmpty()) return ""
    val id = Pattern.quote(fragment)
    val opening = firstMatch(
      "<([A-Za-z][A-Za-z0-9:_-]*)\\b[^>]*\\bid\\s*=\\s*(['\"])$id\\2[^>]*?(/?)>",
      document,
      0,
    ) ?: return ""
    var contentStart = opening.end()
    if (opening.group(3).isEmpty()) {
      val tag = Pattern.quote(opening.group(1))
      val closing = firstMatch("</$tag\\s*>", document, contentStart) ?: return ""
      if (!isBlankHtml(document.substring(contentStart, closing.start()))) {
        return document.substring(opening.start(), closing.end())
      }
      contentStart = closing.end()
    }
    return followingHtml(document, contentStart)
  }

  private const val BLOCK_TAGS = "p|div|li|blockquote|aside|section|dl|ol|ul|table|h[1-6]"

  private fun followingHtml(document: String, start: Int): String {
    var position = start
    anchoredMatch("(?:\\s+|<br\\b[^>]*>|<!--.*?-->)+", document, position)?.let { position = it.end() }
    anchoredMatch("<($BLOCK_TAGS)\\b[^>]*>", document, position)?.let { block ->
      val tag = block.group(1)
      val closing = firstMatch("</$tag\\s*>", document, block.end()) ?: return ""
      return document.substring(position, closing.end())
    }
    val boundary = firstMatch(
      "</?(?:$BLOCK_TAGS|td|th|dd|body)\\b[^>]*>|<a\\b[^>]*\\bid\\s*=",
      document,
      position,
    )
    val inline = document.substring(position, boundary?.start() ?: document.length).trim()
    return if (isBlankHtml(inline)) "" else inline
  }

  private fun isBlankHtml(html: String): Boolean {
    if (Regex("<(?:img|svg|image)\\b", RegexOption.IGNORE_CASE).containsMatchIn(html)) return false
    return html
      .replace(Regex("<[^>]*>"), "")
      .replace(Regex("&nbsp;|&#160;"), "")
      .trim { it.isWhitespace() || it == '\u00A0' }
      .isEmpty()
  }

  private fun firstMatch(pattern: String, text: String, from: Int): Matcher? {
    val matcher = compiled(pattern).matcher(text)
    return if (matcher.find(from)) matcher else null
  }

  private fun anchoredMatch(pattern: String, text: String, at: Int): Matcher? {
    val matcher = compiled(pattern).matcher(text)
    matcher.region(at, text.length)
    return if (matcher.lookingAt()) matcher else null
  }

  private fun compiled(pattern: String): Pattern =
    Pattern.compile(pattern, Pattern.CASE_INSENSITIVE or Pattern.DOTALL)
}
