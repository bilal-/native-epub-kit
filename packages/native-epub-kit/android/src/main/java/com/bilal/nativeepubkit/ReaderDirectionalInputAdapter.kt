@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import org.readium.r2.navigator.OverflowableNavigator
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.Key
import org.readium.r2.navigator.input.KeyEvent
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.navigator.preferences.ReadingProgression

/** Runtime-policy-aware equivalent of Readium's immutable directional input adapter. */
internal class ReaderDirectionalInputAdapter(
  private val navigator: OverflowableNavigator,
  private val policy: () -> ResolvedReaderNavigationPolicy,
  private val onNavigation: () -> Unit,
) : InputListener {
  override fun onTap(event: TapEvent): Boolean {
    val current = policy()
    if (current.inputSuppressed || !current.edgeTapNavigation || !movementCanBeAttempted(current)) {
      return false
    }
    val width = navigator.publicationView.width.toDouble()
    val edgeSize = maxOf(MINIMUM_EDGE_SIZE, EDGE_THRESHOLD_PERCENT * width)
    return when (event.point.x) {
      in (width - edgeSize)..width -> goRight(current)
      in 0.0..edgeSize -> goLeft(current)
      else -> false
    }
  }

  override fun onKey(event: KeyEvent): Boolean {
    val current = policy()
    if (
      event.type != KeyEvent.Type.Down ||
      event.modifiers.isNotEmpty() ||
      current.inputSuppressed ||
      !current.hardwareKeyNavigation ||
      !movementCanBeAttempted(current)
    ) {
      return false
    }
    return when (event.key) {
      Key.ArrowUp -> goBackward(current)
      Key.ArrowDown, Key.Space -> goForward(current)
      Key.ArrowLeft -> goLeft(current)
      Key.ArrowRight -> goRight(current)
      else -> false
    }
  }

  private fun movementCanBeAttempted(policy: ResolvedReaderNavigationPolicy): Boolean =
    if (navigator.overflow.value.scroll) {
      policy.chapterTurnGesture == "enabled"
    } else {
      policy.pageTurnGesture == "enabled" || policy.chapterTurnGesture == "enabled"
    }

  private fun goBackward(policy: ResolvedReaderNavigationPolicy): Boolean = navigate {
    navigator.goBackward(animated = policy.animatedTransitions)
  }

  private fun goForward(policy: ResolvedReaderNavigationPolicy): Boolean = navigate {
    navigator.goForward(animated = policy.animatedTransitions)
  }

  private fun goLeft(policy: ResolvedReaderNavigationPolicy): Boolean =
    when (navigator.overflow.value.readingProgression) {
      ReadingProgression.LTR -> goBackward(policy)
      ReadingProgression.RTL -> goForward(policy)
    }

  private fun goRight(policy: ResolvedReaderNavigationPolicy): Boolean =
    when (navigator.overflow.value.readingProgression) {
      ReadingProgression.LTR -> goForward(policy)
      ReadingProgression.RTL -> goBackward(policy)
    }

  private fun navigate(action: () -> Boolean): Boolean {
    onNavigation()
    return action()
  }

  private companion object {
    const val EDGE_THRESHOLD_PERCENT = 0.3
    const val MINIMUM_EDGE_SIZE = 80.0
  }
}
