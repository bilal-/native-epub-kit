package com.bilal.nativeepubkit

import java.text.BreakIterator
import java.util.Locale

internal data class BoundedSelectionText(
  val text: String,
  val truncated: Boolean,
)

internal object SelectionTextBounder {
  /**
   * Bounds a bridge payload without cutting a user-perceived character.
   *
   * Android's `java.text.BreakIterator` is ICU-backed on device, so the
   * boundary follows the platform's Unicode grapheme implementation while
   * keeping this helper runnable in local JVM tests.
   */
  fun bound(value: String, maximumUtf16Units: Int): BoundedSelectionText {
    require(maximumUtf16Units >= 0)
    if (value.length <= maximumUtf16Units) {
      return BoundedSelectionText(value, truncated = false)
    }
    if (maximumUtf16Units == 0) {
      return BoundedSelectionText("", truncated = true)
    }

    val iterator = BreakIterator.getCharacterInstance(Locale.ROOT).apply {
      setText(value)
    }
    val boundary = iterator.preceding(maximumUtf16Units + 1).coerceAtLeast(0)
    return BoundedSelectionText(value.substring(0, boundary), truncated = true)
  }

  /** Keeps the context nearest a selection while preserving a grapheme boundary. */
  fun boundEnd(value: String, maximumUtf16Units: Int): BoundedSelectionText {
    require(maximumUtf16Units >= 0)
    if (value.length <= maximumUtf16Units) {
      return BoundedSelectionText(value, truncated = false)
    }
    if (maximumUtf16Units == 0) {
      return BoundedSelectionText("", truncated = true)
    }

    val iterator = BreakIterator.getCharacterInstance(Locale.ROOT).apply {
      setText(value)
    }
    val minimumStart = (value.length - maximumUtf16Units).coerceAtLeast(0)
    val boundary = iterator.following(minimumStart - 1).coerceAtLeast(0)
    return BoundedSelectionText(value.substring(boundary), truncated = true)
  }
}
