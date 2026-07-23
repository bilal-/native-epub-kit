package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ReaderEventProtocolTest {
  @Test
  fun matchesSharedEventAndCommandContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      ReaderEventProtocol.LOCATION_THROTTLE_MILLISECONDS,
      contract.getLong("locationThrottleMilliseconds"),
    )

    val commandCases = contract.getJSONArray("commandCases")
    for (index in 0 until commandCases.length()) {
      val testCase = commandCases.getJSONObject(index)
      val result = ReaderEventProtocol.commandErrorCode(
        StableReaderState.fromWireValue(testCase.getString("state")),
        testCase.getBoolean("destroyed"),
      )?.wireValue
      val expected = if (testCase.isNull("errorCode")) null else testCase.getString("errorCode")
      assertEquals(expected, result)
    }

    val eventCases = contract.getJSONArray("eventCases")
    for (caseIndex in 0 until eventCases.length()) {
      val testCase = eventCases.getJSONObject(caseIndex)
      val protocol = ReaderEventProtocol()
      val steps = testCase.getJSONArray("steps")
      for (stepIndex in 0 until steps.length()) {
        val step = steps.getJSONObject(stepIndex)
        val sequence = when (step.getString("kind")) {
          "event" -> protocol.nextEvent(step.getLong("generation"))
          "location" -> protocol.nextLocation(
            step.getLong("generation"),
            StableReaderLocationReason.fromWireValue(step.getString("reason")),
            step.getLong("timestampMilliseconds"),
          )
          else -> error("Unknown event step")
        }
        assertEquals(
          "${testCase.getString("name")} step $stepIndex accepted",
          step.getBoolean("accepted"),
          sequence != null,
        )
        assertEquals(
          "${testCase.getString("name")} step $stepIndex sequence",
          step.optLong("sequence").takeUnless { step.isNull("sequence") },
          sequence,
        )
      }
    }
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitReaderApiContract")) {
      "nativeEpubKitReaderApiContract system property is required"
    }
}
