package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class SelectionActionPolicyTest {
  private val contract: JSONObject
    get() = JSONObject(
      File(
        requireNotNull(System.getProperty("nativeEpubKitSelectionActionPolicyContract")),
      ).readText(Charsets.UTF_8),
    )

  @Test
  fun boundsNormalizationAndDirectionMatchTheSharedContract() {
    val contract = contract
    assertEquals(1, contract.getInt("version"))
    assertEquals(contract.getInt("maximumActions"), SelectionActionPolicy.MAXIMUM_ACTIONS)
    assertEquals(
      contract.getInt("maximumActionIdUtf16Units"),
      SelectionActionPolicy.MAXIMUM_ACTION_ID_UTF16_UNITS,
    )
    assertEquals(
      contract.getInt("maximumActionTitleUtf16Units"),
      SelectionActionPolicy.MAXIMUM_ACTION_TITLE_UTF16_UNITS,
    )
    assertEquals(
      contract.getInt("maximumSelectionTextUtf16Units"),
      SelectionActionPolicy.MAXIMUM_SELECTION_TEXT_UTF16_UNITS,
    )
    assertEquals(
      contract.getInt("maximumSelectionContextUtf16Units"),
      SelectionActionPolicy.MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS,
    )

    val actionCases = contract.getJSONArray("actionCases")
    for (index in 0 until actionCases.length()) {
      val testCase = actionCases.getJSONObject(index)
      val input = if (testCase.isNull("actions")) null else testCase.getJSONArray("actions")
      if (testCase.optBoolean("expectedError", false)) {
        try {
          SelectionActionPolicy.resolve(input)
          fail("${testCase.getString("name")} should fail")
        } catch (_: SelectionActionPolicyException) {
          // Expected.
        }
      } else {
        val actual = SelectionActionPolicy.resolve(input)
        val expected = testCase.getJSONArray("expected")
        assertEquals(expected.length(), actual.size)
        for (actionIndex in actual.indices) {
          assertEquals(expected.getJSONObject(actionIndex).getString("id"), actual[actionIndex].id)
          assertEquals(
            expected.getJSONObject(actionIndex).getString("title"),
            actual[actionIndex].title,
          )
        }
      }
    }

    val directionCases = contract.getJSONArray("directionCases")
    for (index in 0 until directionCases.length()) {
      val testCase = directionCases.getJSONObject(index)
      assertEquals(
        testCase.getString("name"),
        testCase.getString("expected"),
        SelectionActionPolicy.textDirection(testCase.getString("text")),
      )
    }
  }
}
