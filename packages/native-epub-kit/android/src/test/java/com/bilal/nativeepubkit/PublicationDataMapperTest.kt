package com.bilal.nativeepubkit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PublicationDataMapperTest {
  @Test
  fun mapsMetadataLinksFixedLayoutAndPagedPositions() {
    val child = mapOf<String, Any?>(
      "children" to emptyList<Any>(),
      "href" to "page/one.xhtml#detail",
      "title" to "Detail",
    )
    val duplicateChild = child + ("title" to "Detail alias")
    val toc = listOf(
      mapOf<String, Any?>(
        "children" to listOf(child, duplicateChild),
        "href" to "page/one.xhtml",
        "title" to "One",
      )
    )
    val readingOrder = listOf(
      mapOf<String, Any?>("children" to emptyList<Any>(), "href" to "page/one.xhtml"),
      mapOf<String, Any?>("children" to emptyList<Any>(), "href" to "page/two.xhtml"),
    )
    val positions = listOf(
      locator("page/one.xhtml", 1, 0.0),
      locator("page/two.xhtml", 2, 0.5),
    )

    val snapshot = PublicationDataMapper.mapNormalized(
      identifier = "fixture:fixed",
      title = "Fixed fixture",
      subtitle = "Mapper contract",
      authors = listOf(mapOf("name" to "Fixture Author", "roles" to listOf("aut"))),
      languages = listOf("en"),
      readingProgression = null,
      tableOfContents = toc,
      tableOfContentsShapes = listOf(
        PublicationDataLinkShape(
          href = "page/one.xhtml",
          children = listOf(
            PublicationDataLinkShape("page/one.xhtml#detail", emptyList()),
            PublicationDataLinkShape("page/one.xhtml#detail", emptyList()),
          ),
        )
      ),
      readingOrder = readingOrder,
      readingOrderHrefs = listOf("page/one.xhtml", "page/two.xhtml"),
      positions = positions,
      fixedLayout = true,
      continuousProgressAvailable = false,
    )
    val info = snapshot.publicationInfoValue("reader", 7, 12)
    assertEquals("fixture:fixed", info["identifier"])
    assertEquals("Fixed fixture", info["title"])
    assertEquals("fixed", info["layout"])
    assertEquals("auto", info["readingProgression"])
    assertEquals(2, info["positionCount"])
    @Suppress("UNCHECKED_CAST")
    val capabilities = info["capabilities"] as Map<String, Any?>
    assertFalse(capabilities["customFonts"] as Boolean)
    assertFalse(capabilities["images"] as Boolean)
    assertEquals("position", capabilities["progressPrecision"])
    assertEquals(12L, capabilities["mappingDurationMilliseconds"])
    @Suppress("UNCHECKED_CAST")
    val warnings = capabilities["warnings"] as List<String>
    assertTrue("toc-duplicate-targets" in warnings)
    assertTrue("toc-incomplete" in warnings)
    assertTrue("fixed-layout-preferences-limited" in warnings)
    assertTrue("android-fixed-layout-image-activation-unsupported" in warnings)

    val page = snapshot.positionsPageValue("reader", 7, 1, 10_000)
    assertEquals(1, page["offset"])
    assertEquals(2, page["total"])
    assertFalse(page.containsKey("nextOffset"))
    @Suppress("UNCHECKED_CAST")
    assertEquals(1, (page["positions"] as List<Map<String, Any?>>).size)
  }

  private fun locator(href: String, position: Int, totalProgression: Double): Map<String, Any?> =
    mapOf(
      "href" to href,
      "type" to "application/xhtml+xml",
      "locations" to mapOf(
        "position" to position,
        "progression" to 0.0,
        "totalProgression" to totalProgression,
      ),
    )
}
