package com.bilal.nativeepubkit

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderReadinessGateTest {
  @Test
  fun requiresPublicationDataAndViewportInEitherOrder() {
    val dataFirst = ReaderReadinessGate().apply { begin(4) }
    assertFalse(dataFirst.markPublicationDataReady(4))
    assertTrue(dataFirst.markViewportReady(4))

    val viewportFirst = ReaderReadinessGate().apply { begin(5) }
    assertFalse(viewportFirst.markViewportReady(5))
    assertTrue(viewportFirst.markPublicationDataReady(5))
  }

  @Test
  fun ignoresStaleGenerationsAndCompletesOnlyOnce() {
    val gate = ReaderReadinessGate().apply { begin(8) }
    assertFalse(gate.markViewportReady(7))
    assertFalse(gate.markPublicationDataReady(8))
    assertTrue(gate.isWaiting(8))
    assertTrue(gate.markViewportReady(8))
    assertFalse(gate.isWaiting(8))
    assertFalse(gate.markViewportReady(8))
  }

  @Test
  fun resetRejectsLateSignals() {
    val gate = ReaderReadinessGate().apply { begin(12) }
    gate.reset()
    assertFalse(gate.markPublicationDataReady(12))
    assertFalse(gate.markViewportReady(12))
    assertFalse(gate.isWaiting(12))
  }
}
