package com.bilal.nativeepubkit

internal data class PublicationDataLinkShape(
  val href: String,
  val children: List<PublicationDataLinkShape>,
)

internal data class PublicationPositionPageBounds(
  val offset: Int,
  val count: Int,
  val nextOffset: Int?,
)

internal object PublicationDataPolicy {
  const val DEFAULT_POSITION_PAGE_SIZE = 128
  const val MAXIMUM_POSITION_PAGE_SIZE = 256

  fun positionPageBounds(
    total: Int,
    requestedOffset: Int?,
    requestedLimit: Int?,
  ): PublicationPositionPageBounds {
    val safeTotal = total.coerceAtLeast(0)
    val offset = (requestedOffset ?: 0).coerceIn(0, safeTotal)
    val requested = requestedLimit ?: DEFAULT_POSITION_PAGE_SIZE
    val limit = (if (requested > 0) requested else DEFAULT_POSITION_PAGE_SIZE)
      .coerceAtMost(MAXIMUM_POSITION_PAGE_SIZE)
    val count = limit.coerceAtMost(safeTotal - offset)
    val end = offset + count
    return PublicationPositionPageBounds(
      offset = offset,
      count = count,
      nextOffset = end.takeIf { it < safeTotal },
    )
  }

  fun warnings(
    tableOfContents: List<PublicationDataLinkShape>,
    readingOrderHrefs: List<String>,
    positionCount: Int,
    fixedLayout: Boolean,
  ): List<String> = buildList {
    val flattened = flatten(tableOfContents)
    if (flattened.isEmpty()) add("toc-empty")

    val targets = flattened.map { normalizeTargetHref(it.href) }
    if (targets.toSet().size != targets.size) add("toc-duplicate-targets")

    val coveredResources = flattened.map { normalizeResourceHref(it.href) }.toSet()
    val readingOrderResources = readingOrderHrefs.map(::normalizeResourceHref).toSet()
    if (readingOrderResources.any { it !in coveredResources }) add("toc-incomplete")
    if (positionCount == 0) add("positions-unavailable")
    if (fixedLayout) add("fixed-layout-preferences-limited")
  }

  private fun flatten(links: List<PublicationDataLinkShape>): List<PublicationDataLinkShape> =
    buildList {
      fun visit(link: PublicationDataLinkShape, depth: Int) {
        if (depth > 256) return
        add(link)
        link.children.forEach { visit(it, depth + 1) }
      }
      links.forEach { visit(it, 0) }
    }

  private fun normalizeResourceHref(href: String): String {
    val resource = href.substringBefore('#').substringBefore('?')
    val segments = mutableListOf<String>()
    for (segment in resource.split('/')) {
      when (segment) {
        "", "." -> Unit
        ".." -> if (segments.isNotEmpty()) segments.removeAt(segments.lastIndex)
        else -> segments += segment
      }
    }
    return segments.joinToString("/")
  }

  private fun normalizeTargetHref(href: String): String =
    normalizeResourceHref(href) + href.substringAfter('#', "").let {
      if ('#' in href) "#$it" else ""
    }
}
