package com.bilal.nativeepubkit

import org.json.JSONObject

internal class ReaderNavigationPolicyValidationException(message: String) :
  IllegalArgumentException(message)

internal enum class ReaderNavigationPolicyName(val wireValue: String) {
  PAGE_TURN_GESTURE("pageTurnGesture"),
  CHAPTER_TURN_GESTURE("chapterTurnGesture"),
  EDGE_TAP_NAVIGATION("edgeTapNavigation"),
  HARDWARE_KEY_NAVIGATION("hardwareKeyNavigation"),
  ANIMATED_TRANSITIONS("animatedTransitions"),
  INPUT_SUPPRESSED("inputSuppressed");

  val application: String
    get() = if (this == CHAPTER_TURN_GESTURE) "navigator-recreation" else "live"
}

internal data class ResolvedReaderNavigationPolicy(
  val pageTurnGesture: String,
  val chapterTurnGesture: String,
  val edgeTapNavigation: Boolean,
  val hardwareKeyNavigation: Boolean,
  val animatedTransitions: Boolean,
  val inputSuppressed: Boolean,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "animatedTransitions" to animatedTransitions,
    "chapterTurnGesture" to chapterTurnGesture,
    "edgeTapNavigation" to edgeTapNavigation,
    "hardwareKeyNavigation" to hardwareKeyNavigation,
    "inputSuppressed" to inputSuppressed,
    "pageTurnGesture" to pageTurnGesture,
  )

  companion object {
    val DEFAULTS = ResolvedReaderNavigationPolicy(
      pageTurnGesture = "enabled",
      chapterTurnGesture = "disabled",
      edgeTapNavigation = false,
      hardwareKeyNavigation = true,
      animatedTransitions = false,
      inputSuppressed = false,
    )

    fun decode(value: Any?): ResolvedReaderNavigationPolicy {
      if (value == null) return DEFAULTS
      val objectValue = value as? JSONObject
        ?: throw ReaderNavigationPolicyValidationException("navigation policy must be an object")
      val allowed = ReaderNavigationPolicyName.entries.map { it.wireValue }.toSet()
      if (objectValue.keys().asSequence().any { it !in allowed }) {
        throw ReaderNavigationPolicyValidationException(
          "navigation policy contains an unknown field"
        )
      }
      return ResolvedReaderNavigationPolicy(
        pageTurnGesture = objectValue.gesture("pageTurnGesture", DEFAULTS.pageTurnGesture),
        chapterTurnGesture = objectValue.gesture(
          "chapterTurnGesture",
          DEFAULTS.chapterTurnGesture,
        ),
        edgeTapNavigation = objectValue.boolean(
          "edgeTapNavigation",
          DEFAULTS.edgeTapNavigation,
        ),
        hardwareKeyNavigation = objectValue.boolean(
          "hardwareKeyNavigation",
          DEFAULTS.hardwareKeyNavigation,
        ),
        animatedTransitions = objectValue.boolean(
          "animatedTransitions",
          DEFAULTS.animatedTransitions,
        ),
        inputSuppressed = objectValue.boolean("inputSuppressed", DEFAULTS.inputSuppressed),
      )
    }
  }
}

internal object ReaderNavigationPolicy {
  fun requiresNavigatorRecreation(
    previous: ResolvedReaderNavigationPolicy,
    next: ResolvedReaderNavigationPolicy,
  ): Boolean = previous.chapterTurnGesture != next.chapterTurnGesture

  fun rejectsUserMovement(
    policy: ResolvedReaderNavigationPolicy,
    effectiveLayout: String,
    resourceChanged: Boolean,
  ): Boolean = when {
    resourceChanged -> policy.inputSuppressed || policy.chapterTurnGesture == "disabled"
    effectiveLayout == "paginated" ->
      policy.inputSuppressed || policy.pageTurnGesture == "disabled"
    else -> false
  }

  fun statusPayload(
    policy: ResolvedReaderNavigationPolicy,
    application: String,
    boundaryGranularity: String = "reading-order-resource",
    boundaryPrecision: String = "resource",
    boundaryWarnings: List<String> = listOf("chapter-boundaries-use-reading-order-resources"),
    effectiveLayout: String,
    readingProgression: String,
    instanceId: String,
    generation: Long,
  ): Map<String, Any> = mapOf(
    "application" to application,
    "applied" to policy.toMap(),
    "boundaryGranularity" to boundaryGranularity,
    "boundaryPrecision" to boundaryPrecision,
    "effectiveLayout" to effectiveLayout,
    "generation" to generation,
    "instanceId" to instanceId,
    "readingProgression" to readingProgression,
    "requested" to policy.toMap(),
    "support" to ReaderNavigationPolicyName.entries.map {
      mapOf(
        "application" to it.application,
        "name" to it.wireValue,
        "supported" to true,
      )
    },
    "warnings" to boundaryWarnings,
  )
}

private fun JSONObject.gesture(key: String, fallback: String): String {
  if (!has(key)) return fallback
  val value = opt(key) as? String
    ?: throw ReaderNavigationPolicyValidationException("$key must be a string")
  if (value !in setOf("enabled", "disabled")) {
    throw ReaderNavigationPolicyValidationException("$key is unsupported")
  }
  return value
}

private fun JSONObject.boolean(key: String, fallback: Boolean): Boolean {
  if (!has(key)) return fallback
  return opt(key) as? Boolean
    ?: throw ReaderNavigationPolicyValidationException("$key must be a boolean")
}
