package com.bilal.nativeepubkit

internal data class RectValue(
  val x: Double,
  val y: Double,
  val width: Double,
  val height: Double,
) {
  val isFinite: Boolean
    get() = listOf(x, y, width, height).all(Double::isFinite) && width >= 0 && height >= 0

  fun eventPayload(): Map<String, Double> = mapOf(
    "x" to x,
    "y" to y,
    "width" to width,
    "height" to height,
  )
}

internal data class NormalizedSelectionGeometry(
  val nativeRect: RectValue,
  val readerWindowRect: RectValue,
  val viewRect: RectValue,
  val visibleViewRect: RectValue,
  val visibleWindowRect: RectValue,
  val windowRect: RectValue,
)

internal object SelectionGeometryNormalizer {
  fun normalize(
    nativeRect: RectValue,
    publicationWindowXpx: Int,
    publicationWindowYpx: Int,
    readerWindowXpx: Int,
    readerWindowYpx: Int,
    readerWidthPx: Int,
    readerHeightPx: Int,
    density: Double,
  ): NormalizedSelectionGeometry? {
    if (!nativeRect.isFinite || !density.isFinite() || density <= 0) return null

    val windowRect = RectValue(
      x = (publicationWindowXpx + nativeRect.x) / density,
      y = (publicationWindowYpx + nativeRect.y) / density,
      width = nativeRect.width / density,
      height = nativeRect.height / density,
    )
    val viewRect = RectValue(
      x = (publicationWindowXpx - readerWindowXpx + nativeRect.x) / density,
      y = (publicationWindowYpx - readerWindowYpx + nativeRect.y) / density,
      width = nativeRect.width / density,
      height = nativeRect.height / density,
    )
    val readerWindowRect = RectValue(
      x = readerWindowXpx / density,
      y = readerWindowYpx / density,
      width = readerWidthPx / density,
      height = readerHeightPx / density,
    )
    if (!windowRect.isFinite || !viewRect.isFinite || !readerWindowRect.isFinite) return null
    val visibleViewRect = intersect(
      viewRect,
      RectValue(0.0, 0.0, readerWindowRect.width, readerWindowRect.height),
    )
    val visibleWindowRect = RectValue(
      x = readerWindowRect.x + visibleViewRect.x,
      y = readerWindowRect.y + visibleViewRect.y,
      width = visibleViewRect.width,
      height = visibleViewRect.height,
    )

    return NormalizedSelectionGeometry(
      nativeRect = nativeRect,
      readerWindowRect = readerWindowRect,
      viewRect = viewRect,
      visibleViewRect = visibleViewRect,
      visibleWindowRect = visibleWindowRect,
      windowRect = windowRect,
    )
  }

  private fun intersect(rect: RectValue, viewport: RectValue): RectValue {
    val left = maxOf(rect.x, viewport.x)
    val top = maxOf(rect.y, viewport.y)
    val right = minOf(rect.x + rect.width, viewport.x + viewport.width)
    val bottom = minOf(rect.y + rect.height, viewport.y + viewport.height)
    return RectValue(
      x = left.coerceIn(viewport.x, viewport.x + viewport.width),
      y = top.coerceIn(viewport.y, viewport.y + viewport.height),
      width = (right - left).coerceAtLeast(0.0),
      height = (bottom - top).coerceAtLeast(0.0),
    )
  }
}
