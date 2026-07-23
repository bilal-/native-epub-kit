package com.bilal.nativeepubkit

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderGenerationTest {
  @Test
  fun invalidatesEveryOlderGeneration() {
    val generation = ReaderGeneration()
    val first = generation.advance()

    assertTrue(generation.isCurrent(first))

    val second = generation.advance()

    assertFalse(generation.isCurrent(first))
    assertTrue(generation.isCurrent(second))
  }
}
