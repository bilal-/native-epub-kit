package com.bilal.nativeepubkit

import java.io.ByteArrayOutputStream

internal data class DeferredImageHtmlResult(
  val bytes: ByteArray,
  val imageCount: Int,
  val rewritten: Boolean,
)

/**
 * Protects Android WebView from image-dense reflowable resources without changing the DOM tree.
 *
 * Some valid EPUBs place hundreds of bitmap images in one XHTML spine item. Loading every image
 * eagerly can exhaust Chromium's tile-memory budget and terminate the renderer. Native lazy image
 * attributes preserve element identity, text nodes, and locator stability while limiting decoded
 * image memory to content near the viewport.
 */
internal object ReaderWebViewResourcePolicy {
  const val IMAGE_DENSE_DOCUMENT_THRESHOLD = 200
  const val MAXIMUM_REWRITABLE_HTML_BYTES = 4 * 1_024 * 1_024

  fun deferImagesInDenseHtml(
    bytes: ByteArray,
    threshold: Int = IMAGE_DENSE_DOCUMENT_THRESHOLD,
  ): DeferredImageHtmlResult {
    require(threshold > 0) { "threshold must be positive" }
    if (!isAsciiCompatible(bytes)) {
      return DeferredImageHtmlResult(bytes, imageCount = 0, rewritten = false)
    }

    val imageTags = imageTagRanges(bytes)
    if (imageTags.size < threshold) {
      return DeferredImageHtmlResult(bytes, imageTags.size, rewritten = false)
    }

    val output = ByteArrayOutputStream(bytes.size + imageTags.size * 32)
    var sourceOffset = 0
    var rewritten = false
    for (tag in imageTags) {
      val insertionOffset = tag.first + IMG_TAG_PREFIX.size
      output.write(bytes, sourceOffset, insertionOffset - sourceOffset)
      if (!hasAttribute(bytes, insertionOffset, tag.last, LOADING_ATTRIBUTE)) {
        output.write(LAZY_LOADING_ATTRIBUTE_BYTES)
        if (!hasAttribute(bytes, insertionOffset, tag.last, DECODING_ATTRIBUTE)) {
          output.write(ASYNC_DECODING_ATTRIBUTE_BYTES)
        }
        rewritten = true
      }
      sourceOffset = insertionOffset
    }
    output.write(bytes, sourceOffset, bytes.size - sourceOffset)

    val deferredBytes = if (rewritten) output.toByteArray() else bytes
    val protectedBytes = if (rewritten) {
      injectDenseImageStyle(deferredBytes)
    } else {
      deferredBytes
    }

    return DeferredImageHtmlResult(
      bytes = protectedBytes,
      imageCount = imageTags.size,
      rewritten = rewritten,
    )
  }

  private fun injectDenseImageStyle(bytes: ByteArray): ByteArray {
    if (indexOfAscii(bytes, DENSE_IMAGE_STYLE_MARKER, 0) >= 0) return bytes
    val headEnd = indexOfAscii(bytes, HEAD_END_TAG, 0)
    if (headEnd < 0) return bytes
    val output = ByteArrayOutputStream(bytes.size + DENSE_IMAGE_STYLE_BYTES.size)
    output.write(bytes, 0, headEnd)
    output.write(DENSE_IMAGE_STYLE_BYTES)
    output.write(bytes, headEnd, bytes.size - headEnd)
    return output.toByteArray()
  }

  private fun isAsciiCompatible(bytes: ByteArray): Boolean {
    if (
      bytes.size >= 2 &&
      ((bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()) ||
        (bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()))
    ) {
      return false
    }
    return bytes.take(256).none { it == 0.toByte() }
  }

  private fun imageTagRanges(bytes: ByteArray): List<IntRange> {
    val ranges = mutableListOf<IntRange>()
    var index = 0
    while (index <= bytes.size - IMG_TAG_PREFIX.size) {
      if (startsWithAscii(bytes, index, HTML_COMMENT_PREFIX)) {
        val commentEnd = indexOfAscii(bytes, HTML_COMMENT_SUFFIX, index + HTML_COMMENT_PREFIX.size)
        index = if (commentEnd >= 0) commentEnd + HTML_COMMENT_SUFFIX.size else bytes.size
        continue
      }
      if (
        startsWithAscii(bytes, index, IMG_TAG_PREFIX) &&
        isTagNameBoundary(bytes.getOrNull(index + IMG_TAG_PREFIX.size))
      ) {
        val tagEnd = findTagEnd(bytes, index + IMG_TAG_PREFIX.size)
        if (tagEnd < 0) break
        ranges += index..tagEnd
        index = tagEnd + 1
        continue
      }
      index += 1
    }
    return ranges
  }

  private fun findTagEnd(bytes: ByteArray, start: Int): Int {
    var quote: Byte? = null
    for (index in start until bytes.size) {
      val byte = bytes[index]
      if (quote != null) {
        if (byte == quote) quote = null
      } else {
        when (byte.toInt().toChar()) {
          '\'', '"' -> quote = byte
          '>' -> return index
        }
      }
    }
    return -1
  }

  private fun hasAttribute(
    bytes: ByteArray,
    start: Int,
    endInclusive: Int,
    attribute: ByteArray,
  ): Boolean {
    var index = start
    while (index <= endInclusive - attribute.size + 1) {
      if (
        startsWithAscii(bytes, index, attribute) &&
        isAttributeBoundary(bytes.getOrNull(index - 1)) &&
        isAttributeEndBoundary(bytes.getOrNull(index + attribute.size))
      ) {
        return true
      }
      index += 1
    }
    return false
  }

  private fun startsWithAscii(bytes: ByteArray, start: Int, value: ByteArray): Boolean {
    if (start < 0 || start + value.size > bytes.size) return false
    return value.indices.all { offset ->
      bytes[start + offset].asciiLowercase() == value[offset].asciiLowercase()
    }
  }

  private fun indexOfAscii(bytes: ByteArray, value: ByteArray, start: Int): Int {
    for (index in start..bytes.size - value.size) {
      if (startsWithAscii(bytes, index, value)) return index
    }
    return -1
  }

  private fun Byte.asciiLowercase(): Byte = when (this.toInt().toChar()) {
    in 'A'..'Z' -> (toInt() + ('a'.code - 'A'.code)).toByte()
    else -> this
  }

  private fun isTagNameBoundary(byte: Byte?): Boolean =
    byte == null || byte.toInt().toChar().isWhitespace() || byte.toInt().toChar() in listOf('/', '>')

  private fun isAttributeBoundary(byte: Byte?): Boolean =
    byte == null || byte.toInt().toChar().isWhitespace() || byte.toInt().toChar() == '/'

  private fun isAttributeEndBoundary(byte: Byte?): Boolean =
    byte == null ||
      byte.toInt().toChar().isWhitespace() ||
      byte.toInt().toChar() in listOf('=', '/', '>')

  private val IMG_TAG_PREFIX = "<img".encodeToByteArray()
  private val HTML_COMMENT_PREFIX = "<!--".encodeToByteArray()
  private val HTML_COMMENT_SUFFIX = "-->".encodeToByteArray()
  private val LOADING_ATTRIBUTE = "loading".encodeToByteArray()
  private val DECODING_ATTRIBUTE = "decoding".encodeToByteArray()
  private val LAZY_LOADING_ATTRIBUTE_BYTES = " loading=\"lazy\"".encodeToByteArray()
  private val ASYNC_DECODING_ATTRIBUTE_BYTES = " decoding=\"async\"".encodeToByteArray()
  private val HEAD_END_TAG = "</head>".encodeToByteArray()
  private val DENSE_IMAGE_STYLE_MARKER =
    "data-native-epub-kit-dense-images".encodeToByteArray()
  private val DENSE_IMAGE_STYLE_BYTES = """
    <style data-native-epub-kit-dense-images="1">
    img[loading="lazy"] { content-visibility: auto !important; }
    </style>
  """.trimIndent().encodeToByteArray()
}
