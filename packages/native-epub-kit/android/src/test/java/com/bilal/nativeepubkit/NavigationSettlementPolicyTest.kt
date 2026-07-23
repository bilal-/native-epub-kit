package com.bilal.nativeepubkit

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationSettlementPolicyTest {
  @Test
  fun requiresTheRequestedFragmentInTheRequestedResource() {
    assertTrue(
      NavigationPolicy.fragmentsSettled(
        resourceMatches = true,
        currentFragments = emptyList(),
        currentCssSelector = "#paragraph-2000",
        targetFragments = listOf("#paragraph-2000"),
      )
    )
    assertFalse(
      NavigationPolicy.fragmentsSettled(
        resourceMatches = true,
        currentFragments = listOf("paragraph-0001"),
        targetFragments = listOf("paragraph-2000"),
      )
    )
    assertFalse(
      NavigationPolicy.fragmentsSettled(
        resourceMatches = false,
        currentFragments = listOf("paragraph-2000"),
        targetFragments = listOf("paragraph-2000"),
      )
    )
  }

  @Test
  fun acceptsAnAlreadyVisibleTargetElementOnlyInTheRequestedResource() {
    assertTrue(
      NavigationPolicy.fragmentsSettled(
        resourceMatches = true,
        currentFragments = emptyList(),
        targetElementVisible = true,
        targetFragments = listOf("note-local"),
      )
    )
    assertFalse(
      NavigationPolicy.fragmentsSettled(
        resourceMatches = false,
        currentFragments = emptyList(),
        targetElementVisible = true,
        targetFragments = listOf("note-local"),
      )
    )
  }

  @Test
  fun acceptsAnAdjacentPositionAtTheRequestedOverallProgress() {
    assertTrue(
      settled(
        resourceMatches = false,
        currentPosition = 306,
        targetPosition = 305,
        currentTotalProgression = 0.9501557632398754,
        targetTotalProgression = 0.95,
      )
    )
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 21,
        targetPosition = 20,
        currentTotalProgression = 0.5128205128205128,
        targetTotalProgression = 0.5,
      )
    )
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 61,
        targetPosition = 61,
        currentTotalProgression = 0.9375,
        targetTotalProgression = 0.95,
      )
    )
    assertTrue(
      settled(
        resourceMatches = false,
        currentPosition = 39,
        targetPosition = 38,
        currentTotalProgression = 0.9743589743589743,
        targetTotalProgression = 0.95,
      )
    )
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 2,
        targetPosition = 2,
        currentTotalProgression = 0.5,
        targetTotalProgression = 1.0,
      )
    )
  }

  @Test
  fun rejectsAStaleOrMateriallyDifferentOverallPosition() {
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 161,
        targetPosition = 305,
        currentTotalProgression = 0.4984423676012461,
        targetTotalProgression = 0.95,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 303,
        targetPosition = 305,
        currentTotalProgression = 0.92,
        targetTotalProgression = 0.95,
      )
    )
    assertFalse(
      settled(
        resourceMatches = false,
        currentPosition = 2,
        targetPosition = 1,
        currentTotalProgression = 0.5,
        targetTotalProgression = 0.0,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = null,
        targetPosition = null,
        currentTotalProgression = 0.51,
        targetTotalProgression = 0.5,
      )
    )
  }

  @Test
  fun fallsBackToResourceProgressionWhenOverallProgressIsUnavailable() {
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 20,
        targetPosition = 21,
        currentProgression = 0.61,
        targetProgression = 0.7,
      )
    )
    assertFalse(
      settled(
        resourceMatches = false,
        currentPosition = 20,
        targetPosition = 21,
        currentProgression = 0.7,
        targetProgression = 0.7,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 20,
        targetPosition = 21,
        currentProgression = 0.5,
        targetProgression = 0.7,
      )
    )
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 1,
        targetPosition = 175,
        currentProgression = 0.586,
        targetProgression = 0.585,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 1,
        targetPosition = 175,
        currentProgression = 0.2,
        targetProgression = 0.585,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 1,
        targetPosition = 175,
      )
    )
  }

  @Test
  fun acceptsMatchingOverallProgressWhenToolkitPositionGranularityIsCoarser() {
    assertTrue(
      settled(
        resourceMatches = true,
        currentPosition = 1,
        targetPosition = 175,
        currentTotalProgression = 0.585,
        targetTotalProgression = 0.585,
      )
    )
    assertFalse(
      settled(
        resourceMatches = true,
        currentPosition = 1,
        targetPosition = 175,
        currentTotalProgression = 0.58,
        targetTotalProgression = 0.95,
      )
    )
  }

  private fun settled(
    resourceMatches: Boolean,
    currentPosition: Int?,
    targetPosition: Int?,
    currentProgression: Double? = null,
    targetProgression: Double? = null,
    currentTotalProgression: Double? = null,
    targetTotalProgression: Double? = null,
  ): Boolean = NavigationPolicy.locatorSettled(
    resourceMatches = resourceMatches,
    currentPosition = currentPosition,
    targetPosition = targetPosition,
    currentProgression = currentProgression,
    targetProgression = targetProgression,
    currentTotalProgression = currentTotalProgression,
    targetTotalProgression = targetTotalProgression,
  )
}
