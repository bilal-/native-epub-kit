package com.bilal.nativeepubkit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionTextTest {
  @Test
  fun preservesTextWithinTheBridgeLimit() {
    val result = SelectionTextBounder.bound("مطالعہ", 8)

    assertEquals("مطالعہ", result.text)
    assertFalse(result.truncated)
  }

  @Test
  fun truncatesBeforeACombiningGrapheme() {
    val result = SelectionTextBounder.bound("abcde\u0301", 5)

    assertEquals("abcd", result.text)
    assertTrue(result.truncated)
  }

  @Test
  fun truncatesBeforeASurrogatePair() {
    val result = SelectionTextBounder.bound("abcd📖", 5)

    assertEquals("abcd", result.text)
    assertTrue(result.truncated)
  }

  @Test
  fun suffixContextKeepsTheGraphemesNearestTheSelection() {
    val result = SelectionTextBounder.boundEnd("📖abcde\u0301", 5)

    assertEquals("bcde\u0301", result.text)
    assertTrue(result.truncated)
  }
}
