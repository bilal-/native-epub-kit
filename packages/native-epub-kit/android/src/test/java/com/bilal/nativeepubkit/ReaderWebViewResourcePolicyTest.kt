package com.bilal.nativeepubkit

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderWebViewResourcePolicyTest {
  @Test
  fun defersImagesOnlyWhenTheDocumentIsDense() {
    val html = "<html><head></head><body>" +
      "<img src=\"1.jpg\"><IMG decoding=\"sync\" src=\"2.jpg\"/></body></html>"

    val sparse = ReaderWebViewResourcePolicy.deferImagesInDenseHtml(
      html.encodeToByteArray(),
      threshold = 3,
    )
    assertFalse(sparse.rewritten)
    assertEquals(2, sparse.imageCount)
    assertEquals(html, sparse.bytes.decodeToString())

    val dense = ReaderWebViewResourcePolicy.deferImagesInDenseHtml(
      html.encodeToByteArray(),
      threshold = 2,
    )
    assertTrue(dense.rewritten)
    assertEquals(2, dense.imageCount)
    val rewritten = dense.bytes.decodeToString()
    assertTrue("data-native-epub-kit-dense-images" in rewritten)
    assertTrue("content-visibility: auto" in rewritten)
    assertTrue("<img loading=\"lazy\" decoding=\"async\" src=\"1.jpg\">" in rewritten)
    assertTrue("<IMG loading=\"lazy\" decoding=\"sync\" src=\"2.jpg\"/>" in rewritten)
  }

  @Test
  fun preservesPublisherLoadingIntentAndNonImageMarkup() {
    val html = "<!-- <img src=\"comment.jpg\"> -->" +
      "<image href=\"vector.svg\"></image>" +
      "<img loading=\"eager\" src=\"hero.jpg\">"

    val result = ReaderWebViewResourcePolicy.deferImagesInDenseHtml(
      html.encodeToByteArray(),
      threshold = 1,
    )

    assertFalse(result.rewritten)
    assertEquals(1, result.imageCount)
    assertEquals(html, result.bytes.decodeToString())
  }

  @Test
  fun leavesUtf16DocumentsByteExact() {
    val utf16 = "<img src=\"page.jpg\">".toByteArray(Charsets.UTF_16)

    val result = ReaderWebViewResourcePolicy.deferImagesInDenseHtml(utf16, threshold = 1)

    assertFalse(result.rewritten)
    assertEquals(0, result.imageCount)
    assertArrayEquals(utf16, result.bytes)
  }
}
