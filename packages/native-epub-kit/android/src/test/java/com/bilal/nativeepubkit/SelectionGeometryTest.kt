package com.bilal.nativeepubkit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SelectionGeometryTest {
  @Test
  fun normalizesCssViewportCoordinatesIntoReaderAndWindowDp() {
    val result = SelectionGeometryNormalizer.normalize(
      nativeRect = RectValue(x = 60.0, y = 120.0, width = 240.0, height = 72.0),
      publicationWindowXpx = 30,
      publicationWindowYpx = 600,
      readerWindowXpx = 30,
      readerWindowYpx = 570,
      readerWidthPx = 1080,
      readerHeightPx = 1500,
      density = 3.0,
    )!!

    assertEquals(RectValue(60.0, 120.0, 240.0, 72.0), result.nativeRect)
    assertEquals(RectValue(20.0, 50.0, 80.0, 24.0), result.viewRect)
    assertEquals(RectValue(30.0, 240.0, 80.0, 24.0), result.windowRect)
    assertEquals(RectValue(10.0, 190.0, 360.0, 500.0), result.readerWindowRect)
    assertEquals(RectValue(20.0, 50.0, 80.0, 24.0), result.visibleViewRect)
    assertEquals(RectValue(30.0, 240.0, 80.0, 24.0), result.visibleWindowRect)
  }

  @Test
  fun clipsMultilineUnionGeometryToTheReaderViewport() {
    val result = SelectionGeometryNormalizer.normalize(
      nativeRect = RectValue(x = 20.0, y = -30.0, width = 160.0, height = 80.0),
      publicationWindowXpx = 0,
      publicationWindowYpx = 0,
      readerWindowXpx = 0,
      readerWindowYpx = 0,
      readerWidthPx = 200,
      readerHeightPx = 100,
      density = 1.0,
    )!!

    assertEquals(RectValue(20.0, -30.0, 160.0, 80.0), result.viewRect)
    assertEquals(RectValue(20.0, 0.0, 160.0, 50.0), result.visibleViewRect)
    assertEquals(RectValue(20.0, 0.0, 160.0, 50.0), result.visibleWindowRect)
  }

  @Test
  fun rejectsInvalidGeometryInsteadOfEmittingAnUnanchorableEvent() {
    assertNull(
      SelectionGeometryNormalizer.normalize(
        nativeRect = RectValue(Double.NaN, 0.0, 10.0, 10.0),
        publicationWindowXpx = 0,
        publicationWindowYpx = 0,
        readerWindowXpx = 0,
        readerWindowYpx = 0,
        readerWidthPx = 100,
        readerHeightPx = 100,
        density = 1.0,
      )
    )
  }
}
