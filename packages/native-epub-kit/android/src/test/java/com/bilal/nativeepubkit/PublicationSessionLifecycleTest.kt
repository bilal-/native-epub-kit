package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PublicationSessionLifecycleTest {
  @Test
  fun matchesSharedSessionContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      PublicationSessionLifecycleState.entries.map { it.wireValue },
      contract.getJSONArray("states").let { states ->
        (0 until states.length()).map(states::getString)
      },
    )

    val cases = contract.getJSONArray("cases")
    for (caseIndex in 0 until cases.length()) {
      val testCase = cases.getJSONObject(caseIndex)
      val lifecycle = PublicationSessionLifecycle()
      val steps = testCase.getJSONArray("steps")
      for (stepIndex in 0 until steps.length()) {
        val step = steps.getJSONObject(stepIndex)
        assertEquals(
          "${testCase.getString("name")} step $stepIndex",
          step.getBoolean("accepted"),
          lifecycle.transition(
            PublicationSessionLifecycleState.fromWireValue(step.getString("state"))
          ),
        )
      }
    }
  }

  @Test
  fun twentyCyclesReturnEveryResourceAndProduceABoundedTrend() {
    val ledger = PublicationSessionResourceLedger()
    repeat(20) { index ->
      val id = "session-$index"
      ledger.register(id)
      ledger.update(id, PublicationSessionLifecycleState.RETRIEVING, true, false, false)
      ledger.update(id, PublicationSessionLifecycleState.READY, false, true, false)
      ledger.update(id, PublicationSessionLifecycleState.CLOSED, false, false, false)
      ledger.unregister(id, residentMemoryBytes = 100_000_000L + index * 64_000L)
    }

    val snapshot = ledger.snapshot()
    assertEquals(0, snapshot.activeSessions)
    assertEquals(0, snapshot.ownedAssets)
    assertEquals(0, snapshot.ownedPublications)
    assertEquals(0, snapshot.sourceLeases)
    assertEquals(20, snapshot.completedSessions)
    assertEquals(0, snapshot.forcedReleaseViolations)
    assertEquals(1, snapshot.maximumActiveSessions)
    assertEquals(1, snapshot.maximumOwnedAssets)
    assertEquals(1, snapshot.maximumOwnedPublications)
    assertTrue(snapshot.postWarmupMemoryIsBounded == true)
  }

  @Test
  fun recordsForcedReleaseAndUnboundedSyntheticGrowth() {
    val ledger = PublicationSessionResourceLedger()
    repeat(8) { index ->
      val id = "leak-$index"
      ledger.register(id)
      ledger.update(id, PublicationSessionLifecycleState.READY, false, true, false)
      ledger.unregister(id, residentMemoryBytes = index * 10_000_000L)
    }

    val snapshot = ledger.snapshot()
    assertEquals(8, snapshot.forcedReleaseViolations)
    assertFalse(snapshot.postWarmupMemoryIsBounded ?: true)
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitPublicationSessionContract")) {
      "nativeEpubKitPublicationSessionContract system property is required"
    }
}
