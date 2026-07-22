package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderNavigationPolicyTest {
  @Test
  fun matchesSharedDefaultsAndValidatesValues() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      contract.getJSONObject("defaults").toSimpleNavigationMap(),
      ResolvedReaderNavigationPolicy.DEFAULTS.toMap(),
    )
    val explicit = ResolvedReaderNavigationPolicy.decode(
      JSONObject(
        mapOf(
          "animatedTransitions" to true,
          "chapterTurnGesture" to "enabled",
          "edgeTapNavigation" to true,
          "hardwareKeyNavigation" to false,
          "inputSuppressed" to true,
          "pageTurnGesture" to "disabled",
        )
      )
    )
    assertEquals(true, explicit.animatedTransitions)
    assertEquals("enabled", explicit.chapterTurnGesture)
    assertEquals("disabled", explicit.pageTurnGesture)
    assertThrows(ReaderNavigationPolicyValidationException::class.java) {
      ResolvedReaderNavigationPolicy.decode(JSONObject(mapOf("unknown" to true)))
    }
    assertThrows(ReaderNavigationPolicyValidationException::class.java) {
      ResolvedReaderNavigationPolicy.decode(
        JSONObject(mapOf("chapterTurnGesture" to "sometimes"))
      )
    }
  }

  @Test
  fun separatesLiveAndRecreationBackedFields() {
    val defaults = ResolvedReaderNavigationPolicy.DEFAULTS
    assertFalse(
      ReaderNavigationPolicy.requiresNavigatorRecreation(
        defaults,
        defaults.copy(edgeTapNavigation = true),
      )
    )
    assertTrue(
      ReaderNavigationPolicy.requiresNavigatorRecreation(
        defaults,
        defaults.copy(chapterTurnGesture = "enabled"),
      )
    )
  }

  @Test
  fun rejectsOnlyConflictingUserMovement() {
    val defaults = ResolvedReaderNavigationPolicy.DEFAULTS
    assertFalse(ReaderNavigationPolicy.rejectsUserMovement(defaults, "scrolled", false))
    assertTrue(ReaderNavigationPolicy.rejectsUserMovement(defaults, "scrolled", true))
    assertFalse(ReaderNavigationPolicy.rejectsUserMovement(defaults, "paginated", false))
    assertTrue(
      ReaderNavigationPolicy.rejectsUserMovement(
        defaults.copy(pageTurnGesture = "disabled"),
        "paginated",
        false,
      )
    )
    assertTrue(
      ReaderNavigationPolicy.rejectsUserMovement(
        defaults.copy(inputSuppressed = true),
        "paginated",
        false,
      )
    )
    assertFalse(
      ReaderNavigationPolicy.rejectsUserMovement(
        defaults.copy(chapterTurnGesture = "enabled"),
        "paginated",
        true,
      )
    )
  }

  @Test
  fun emitsCompleteOrderedStatus() {
    val payload = ReaderNavigationPolicy.statusPayload(
      policy = ResolvedReaderNavigationPolicy.DEFAULTS,
      application = "initial",
      effectiveLayout = "scrolled",
      readingProgression = "rtl",
      instanceId = "reader",
      generation = 4,
    )
    assertEquals("reading-order-resource", payload["boundaryGranularity"])
    assertEquals("rtl", payload["readingProgression"])
    val support = payload["support"] as List<*>
    assertEquals(ReaderNavigationPolicyName.entries.size, support.size)
    assertEquals(
      "navigator-recreation",
      (support[1] as Map<*, *>)["application"],
    )
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitNavigationPolicyContract")) {
      "nativeEpubKitNavigationPolicyContract system property is required"
    }
}

private fun JSONObject.toSimpleNavigationMap(): Map<String, Any> =
  keys().asSequence().associateWith { key -> get(key) }
