package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ReaderLifecycleGateTest {
  @Test
  fun matchesSharedLifecycleContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))

    val cases = contract.getJSONArray("cases")
    for (caseIndex in 0 until cases.length()) {
      val testCase = cases.getJSONObject(caseIndex)
      val gate = ReaderLifecycleGate()
      val steps = testCase.getJSONArray("steps")

      for (stepIndex in 0 until steps.length()) {
        val step = steps.getJSONObject(stepIndex)
        assertEquals(
          "${testCase.getString("name")} step $stepIndex",
          step.getBoolean("accepted"),
          gate.accept(step.getString("state"), step.getLong("generation"))
        )
      }
    }
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitLifecycleContract")) {
      "nativeEpubKitLifecycleContract system property is required"
    }
}
