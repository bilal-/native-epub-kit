package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ReaderImagePolicyTest {
  private val contract: JSONObject by lazy {
    JSONObject(
      File(requireNotNull(System.getProperty("nativeEpubKitImagePolicyContract"))).readText()
    )
  }

  @Test
  fun sharedContractMatchesProductionPolicy() {
    assertEquals(1, contract.getInt("version"))
    assertEquals(canonical(contract.getJSONObject("defaults")), canonical(ReaderImagePolicy.DEFAULT.toJson()))
    val cases = contract.getJSONArray("cases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val run = {
        val policy = ReaderImagePolicy.resolve(testCase.opt("policy"))
        assertEquals(canonical(testCase.getJSONObject("expected")), canonical(policy.toJson()))
        val uses = testCase.getJSONObject("uses")
        assertEquals(uses.getBoolean("zoom"), ReaderImagePolicy.allows(ReaderImageUse.ZOOM, policy))
        assertEquals(uses.getBoolean("share"), ReaderImagePolicy.allows(ReaderImageUse.SHARE, policy))
      }
      if (testCase.optBoolean("expectedError", false)) {
        assertThrows(RuntimeException::class.java, run)
      } else {
        run()
      }
    }
  }

  @Test
  fun sourceHandlesAreBounded() {
    assertEquals("opaque", ReaderImagePolicy.validateSourceHandle("opaque"))
    assertThrows(RuntimeException::class.java) { ReaderImagePolicy.validateSourceHandle("") }
    assertThrows(RuntimeException::class.java) {
      ReaderImagePolicy.validateSourceHandle("x".repeat(ReaderImagePolicy.MAXIMUM_SOURCE_HANDLE_UTF16_UNITS + 1))
    }
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
