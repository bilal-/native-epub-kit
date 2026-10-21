package com.bilal.nativeepubkit

import java.io.File
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TypographyProfileTest {
  @Test
  fun sharedProfileCasesValidateAtomicallyAndCompileIdentically() {
    val contract = JSONObject(
      File(requireNotNull(System.getProperty("nativeEpubKitTypographyProfileContract"))).readText()
    )
    assertEquals(1, contract.getInt("version"))
    assertEquals(TypographyProfilePolicy.MAXIMUM_RULES, contract.getInt("maximumRules"))
    assertEquals(
      TypographyProfilePolicy.MAXIMUM_FONT_FAMILIES,
      contract.getInt("maximumFontFamilies"),
    )

    val cases = contract.getJSONArray("cases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val available = testCase.getJSONArray("availableFontFamilies").stringSet()
      val result = TypographyProfilePolicy.validate(testCase.opt("profile"), available)
      val expected = testCase.getJSONObject("expected")
      assertEquals(testCase.getString("name"), expected.getString("status"), result.status)
      assertEquals(testCase.getString("name"), expected.getString("stylesheet"), result.stylesheet)
      val expectedProfile = expected.opt("profile")
      if (expectedProfile == JSONObject.NULL) {
        assertEquals(testCase.getString("name"), null, result.profile)
      } else {
        assertEquals(
          testCase.getString("name"),
          canonical(expectedProfile),
          canonical(result.profile!!.asJson()),
        )
      }
    }
  }

  @Test
  fun styleInjectionIsIdempotentAndNeverUsesScript() {
    val profile = TypographyProfilePolicy.resolve(
      JSONObject(
        """{
          "publisherStyles":"hybrid",
          "defaultFontFamilies":["Lateef","serif"],
          "rules":[{"target":{"kind":"language","value":"ur"},"direction":"rtl"}]
        }"""
      )
    )
    val html = "<html><head><title>Fixture</title></head><body><p>متن</p></body></html>"
    val injected = TypographyStyleInjector.inject(html, profile)
    assertTrue(TypographyStyleInjector.MARKER in injected)
    assertTrue(":lang(ur)" in injected)
    assertFalse("<script" in injected)
    assertEquals(injected, TypographyStyleInjector.inject(injected, profile))
    assertTrue(TypographyStyleInjector.supports("text/chapter.xhtml?x=1#part"))
    assertFalse(TypographyStyleInjector.supports("images/cover.svg"))
  }

  @Test
  fun documentCodecPreservesSupportedEncodingsAndMixedScriptGraphemes() {
    val profile = TypographyProfilePolicy.resolve(
      JSONObject(
        """{
          "publisherStyles":"override",
          "defaultFontFamilies":["Lateef","serif"],
          "rules":[{"target":{"kind":"class","value":"urdu"},"direction":"rtl"}]
        }"""
      )
    )
    val mixed = "قُرْآن Urdu اُردُو English 👩🏽‍💻"
    val utf8 = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><html><head></head><body>$mixed</body></html>"
    val utf16 = "<?xml version=\"1.0\" encoding=\"UTF-16\"?><html><head></head><body>$mixed</body></html>"
    val inputs = listOf(
      Triple(StandardCharsets.UTF_8, byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()), utf8),
      Triple(StandardCharsets.UTF_16LE, byteArrayOf(0xFF.toByte(), 0xFE.toByte()), utf16),
      Triple(StandardCharsets.UTF_16BE, byteArrayOf(0xFE.toByte(), 0xFF.toByte()), utf16),
    )
    for ((charset, bom, html) in inputs) {
      val input = bom + html.toByteArray(charset)
      val result = TypographyDocumentCodec.inject(input, profile)
      assertEquals("injected", result.status)
      assertTrue(result.data.copyOfRange(0, bom.size).contentEquals(bom))
      val decoded = result.data.copyOfRange(bom.size, result.data.size).toString(charset)
      assertTrue(mixed in decoded)
      assertTrue(TypographyStyleInjector.MARKER in decoded)
      val repeated = TypographyDocumentCodec.inject(result.data, profile)
      assertEquals("already-injected", repeated.status)
      assertArrayEquals(result.data, repeated.data)
    }
  }

  @Test
  fun unsupportedOrInvalidTextIsReturnedByteForByte() {
    val profile = TypographyProfilePolicy.resolve(
      JSONObject("""{"publisherStyles":"hybrid","rules":[]}""")
    )
    val unsupported =
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><html><head></head></html>"
        .toByteArray(StandardCharsets.UTF_8)
    val unsupportedResult = TypographyDocumentCodec.inject(unsupported, profile)
    assertEquals("unsupported-encoding", unsupportedResult.status)
    assertArrayEquals(unsupported, unsupportedResult.data)

    val invalid = byteArrayOf(0xC3.toByte(), 0x28)
    val invalidResult = TypographyDocumentCodec.inject(invalid, profile)
    assertEquals("invalid-text", invalidResult.status)
    assertArrayEquals(invalid, invalidResult.data)
  }

  private fun ResolvedTypographyProfile.asJson(): JSONObject = JSONObject()
    .put("publisherStyles", publisherStyles.wireValue)
    .also { json -> colors?.let { json.put("colors", it.asJson()) } }
    .put("defaultFontFamilies", JSONArray(defaultFontFamilies))
    .put("rules", JSONArray(rules.map { it.asJson() }))

  private fun ReaderColorProfile.asJson(): JSONObject = JSONObject()
    .put("background", background)
    .put("link", link)
    .put("text", text)

  private fun TypographyRule.asJson(): JSONObject = JSONObject()
    .put("target", JSONObject().put("kind", target.kind).put("value", target.value))
    .also { json -> color?.let { json.put("color", it) } }
    .also { json -> fontFamilies?.let { json.put("fontFamilies", JSONArray(it)) } }
    .also { json -> direction?.let { json.put("direction", it) } }
    .also { json -> lineHeight?.let { json.put("lineHeight", it) } }
    .also { json -> fontWeight?.let { json.put("fontWeight", it) } }
    .also { json -> borderTop?.let { json.put("borderTop", it) } }

  private fun JSONArray.stringSet(): Set<String> =
    (0 until length()).map(::getString).toSet()

  private fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(
      prefix = "{",
      postfix = "}",
    ) { key -> "${JSONObject.quote(key)}:${canonical(value.get(key))}" }
    is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") {
      canonical(value.get(it))
    }
    is String -> JSONObject.quote(value)
    is Boolean, is Number -> value.toString()
    else -> JSONObject.quote(value.toString())
  }
}
