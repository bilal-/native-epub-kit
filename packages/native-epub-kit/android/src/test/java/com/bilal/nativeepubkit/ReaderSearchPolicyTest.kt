package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ReaderSearchPolicyTest {
  private val contract: JSONObject by lazy {
    JSONObject(File(requireNotNull(System.getProperty("nativeEpubKitSearchPolicyContract"))).readText())
  }

  @Test
  fun sharedBoundsDefaultsAndRequestsMatch() {
    assertEquals(1, contract.getInt("version"))
    val bounds = contract.getJSONObject("bounds")
    assertEquals(bounds.getInt("defaultPageSize"), ReaderSearchPolicy.DEFAULT_PAGE_SIZE)
    assertEquals(bounds.getInt("maximumPageSize"), ReaderSearchPolicy.MAXIMUM_PAGE_SIZE)
    assertEquals(bounds.getInt("maximumResults"), ReaderSearchPolicy.MAXIMUM_RESULTS)
    assertEquals(
      bounds.getInt("maximumQueryUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_QUERY_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumLanguageUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_LANGUAGE_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumExcerptContextUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_EXCERPT_CONTEXT_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumExcerptHighlightUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_EXCERPT_HIGHLIGHT_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumResourceTitleUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_RESOURCE_TITLE_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumSessionIdUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_SESSION_ID_UTF16_UNITS,
    )
    assertEquals(
      bounds.getInt("maximumCursorUtf16Units"),
      ReaderSearchPolicy.MAXIMUM_CURSOR_UTF16_UNITS,
    )
    assertEquals(
      canonical(contract.getJSONObject("defaults")),
      canonical(ReaderSearchPolicy.DEFAULT_OPTIONS.toJson()),
    )
    assertEquals(
      canonical(contract.getJSONObject("decorationGroups")),
      canonical(JSONObject(ReaderSearchPolicy.DECORATION_GROUPS)),
    )

    val cases = contract.getJSONArray("requestCases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val query = expanded(testCase, "query")
      val options = testCase.opt("options")
      val action = {
        val resolved = ReaderSearchPolicy.resolve(query, options)
        assertEquals(canonical(testCase.getJSONObject("expected")), canonical(resolved.toJson()))
      }
      if (testCase.optBoolean("expectedError", false)) {
        assertThrows(RuntimeException::class.java, action)
      } else {
        action()
      }
    }
  }

  @Test
  fun sharedExcerptCasesMatchAndPreserveNearestContext() {
    val cases = contract.getJSONArray("excerptCases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val excerpt = ReaderSearchPolicy.excerpt(
        before = expanded(testCase, "before"),
        highlight = testCase.getString("highlight"),
        after = expanded(testCase, "after"),
      )
      if (testCase.has("expected")) {
        assertEquals(canonical(testCase.getJSONObject("expected")), canonical(JSONObject(excerpt.toMap())))
      }
      if (testCase.has("expectedLengths")) {
        val lengths = testCase.getJSONObject("expectedLengths")
        assertEquals(lengths.getInt("before"), excerpt.before.length)
        assertEquals(lengths.getInt("highlight"), excerpt.highlight.length)
        assertEquals(lengths.getInt("after"), excerpt.after.length)
      }
      if (testCase.has("expectedTruncated")) {
        assertEquals(testCase.getBoolean("expectedTruncated"), excerpt.truncated)
      }
    }
  }

  @Test
  fun identifiersAreBoundedAndInitialCursorIsExplicit() {
    assertEquals("session-1", ReaderSearchPolicy.validateSessionId("session-1"))
    assertEquals("", ReaderSearchPolicy.validateCursor("", allowInitialEmpty = true))
    assertEquals("0", ReaderSearchPolicy.validateCursor("0"))
    assertThrows(RuntimeException::class.java) { ReaderSearchPolicy.validateSessionId("") }
    assertThrows(RuntimeException::class.java) { ReaderSearchPolicy.validateCursor("bad cursor") }
  }

  private fun expanded(value: JSONObject, key: String): String {
    value.optString(key).takeIf { value.has(key) }?.let { return it }
    val repeat = value.optJSONObject("${key}Repeat") ?: return ""
    return repeat.getString("value").repeat(repeat.getInt("count"))
  }

  private fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(
      prefix = "{",
      postfix = "}",
    ) { key -> "${JSONObject.quote(key)}:${canonical(value.get(key))}" }
    is String -> JSONObject.quote(value)
    is Boolean, is Number -> value.toString()
    else -> JSONObject.quote(value.toString())
  }
}
