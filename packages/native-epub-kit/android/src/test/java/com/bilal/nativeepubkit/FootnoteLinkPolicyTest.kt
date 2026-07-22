package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class FootnoteLinkPolicyTest {
  private val contract: JSONObject by lazy {
    JSONObject(
      File(requireNotNull(System.getProperty("nativeEpubKitFootnoteLinkPolicyContract"))).readText()
    )
  }

  @Test
  fun sharedContractMatchesProductionPolicy() {
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      FootnoteLinkPolicy.MAXIMUM_HEURISTIC_RULES,
      contract.getInt("maximumHeuristicRules"),
    )
    assertEquals(
      FootnoteLinkPolicy.MAXIMUM_EXTERNAL_SCHEMES,
      contract.getInt("maximumExternalSchemes"),
    )

    val footnoteCases = contract.getJSONArray("footnoteCases")
    for (index in 0 until footnoteCases.length()) {
      val testCase = footnoteCases.getJSONObject(index)
      val run = {
        val policy = FootnoteLinkPolicy.resolveFootnote(testCase.opt("policy"))
        val decision = FootnoteLinkPolicy.decideInternal(
          policy,
          testCase.getString("href"),
          testCase.getBoolean("semantic"),
        )
        assertEquals(canonical(testCase.getJSONObject("expectedPolicy")), canonical(policy.toJson()))
        assertEquals(
          canonical(testCase.getJSONObject("expectedDecision")),
          canonical(decision.toJson()),
        )
      }
      if (testCase.optBoolean("expectedError", false)) {
        assertThrows(RuntimeException::class.java, run)
      } else {
        run()
      }
    }

    val linkCases = contract.getJSONArray("linkCases")
    for (index in 0 until linkCases.length()) {
      val testCase = linkCases.getJSONObject(index)
      val run = {
        val policy = FootnoteLinkPolicy.resolveLinks(testCase.opt("policy"))
        val decision = FootnoteLinkPolicy.decideExternal(policy, testCase.getString("href"))
        assertEquals(canonical(testCase.getJSONObject("expectedPolicy")), canonical(policy.toJson()))
        assertEquals(
          canonical(testCase.getJSONObject("expectedDecision")),
          canonical(decision.toJson()),
        )
      }
      if (testCase.optBoolean("expectedError", false)) {
        assertThrows(RuntimeException::class.java, run)
      } else {
        run()
      }
    }
  }

  @Test
  fun collectionBoundsFailClosed() {
    val rules = (0..FootnoteLinkPolicy.MAXIMUM_HEURISTIC_RULES).map { index ->
      mapOf("id" to "rule-$index", "fragmentPrefix" to "note-$index")
    }
    assertThrows(RuntimeException::class.java) {
      FootnoteLinkPolicy.resolveFootnote(
        JSONObject(mapOf("mode" to "semantic-and-heuristic", "heuristicRules" to rules))
      )
    }
    val schemes = (0..FootnoteLinkPolicy.MAXIMUM_EXTERNAL_SCHEMES).map { "scheme$it" }
    assertThrows(RuntimeException::class.java) {
      FootnoteLinkPolicy.resolveLinks(JSONObject(mapOf("allowedExternalSchemes" to schemes)))
    }
  }

  private fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(
      prefix = "{",
      postfix = "}",
    ) { key -> "${JSONObject.quote(key)}:${canonical(value.get(key))}" }
    is org.json.JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") {
      canonical(value.get(it))
    }
    is String -> JSONObject.quote(value)
    is Boolean, is Number -> value.toString()
    else -> JSONObject.quote(value.toString())
  }
}
