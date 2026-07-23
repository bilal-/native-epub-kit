package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NavigationPolicyTest {
  @Test
  fun matchesSharedNavigationContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      contract.getInt("maximumBridgePosition"),
      NavigationPolicy.MAXIMUM_BRIDGE_POSITION,
    )

    val progressionCases = contract.getJSONArray("progressionCases")
    for (index in 0 until progressionCases.length()) {
      val testCase = progressionCases.getJSONObject(index)
      assertEquals(
        testCase.getString("name"),
        testCase.getBoolean("valid"),
        NavigationPolicy.progressionIsValid(testCase.getDouble("value")),
      )
    }

    val positionCases = contract.getJSONArray("positionCases")
    for (index in 0 until positionCases.length()) {
      val testCase = positionCases.getJSONObject(index)
      assertEquals(
        testCase.getString("name"),
        testCase.getBoolean("valid"),
        NavigationPolicy.positionIsValid(testCase.getDouble("value")),
      )
    }

    val outcomeCases = contract.getJSONArray("outcomeCases")
    for (index in 0 until outcomeCases.length()) {
      val testCase = outcomeCases.getJSONObject(index)
      val kind = when (testCase.getString("command")) {
        "jump" -> NavigationCommandKind.JUMP
        "logical" -> NavigationCommandKind.LOGICAL
        else -> error("Unknown navigation command")
      }
      assertEquals(
        testCase.getString("name"),
        testCase.getString("expected"),
        NavigationPolicy.outcome(kind, testCase.getBoolean("moved")).wireValue,
      )
    }

    val restoreCases = contract.getJSONArray("restoreReasonCases")
    for (index in 0 until restoreCases.length()) {
      val testCase = restoreCases.getJSONObject(index)
      assertEquals(
        testCase.getString("name"),
        testCase.getString("expected"),
        NavigationPolicy.initialLocationReason(
          hasLocator = testCase.getBoolean("hasLocator"),
          preferenceChange = testCase.getBoolean("preferenceChange"),
        ).wireValue,
      )
    }
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitNavigationContract")) {
      "nativeEpubKitNavigationContract system property is required"
    }
}
