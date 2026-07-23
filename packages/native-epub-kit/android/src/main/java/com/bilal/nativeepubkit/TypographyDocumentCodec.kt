package com.bilal.nativeepubkit

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

internal data class TypographyDocumentInjectionResult(
  val data: ByteArray,
  val encoding: String?,
  val status: String,
)

/** Preserves supported HTML/XHTML byte encodings and fails closed for all others. */
internal object TypographyDocumentCodec {
  private val XML_ENCODING = Regex(
    """<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']""",
    RegexOption.IGNORE_CASE,
  )

  fun inject(
    data: ByteArray,
    profile: ResolvedTypographyProfile,
  ): TypographyDocumentInjectionResult {
    val decoded = decode(data)
      ?: return TypographyDocumentInjectionResult(data, null, "invalid-text")
    if (!declarationIsSupported(decoded.text, decoded.encoding)) {
      return TypographyDocumentInjectionResult(data, decoded.encoding.wireValue, "unsupported-encoding")
    }
    if (TypographyStyleInjector.MARKER in decoded.text) {
      return TypographyDocumentInjectionResult(data, decoded.encoding.wireValue, "already-injected")
    }
    val injected = TypographyStyleInjector.inject(decoded.text, profile)
    if (injected == decoded.text) {
      return TypographyDocumentInjectionResult(data, decoded.encoding.wireValue, "no-head")
    }
    val encoded = decoded.encoding.charset.newEncoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
      .encode(java.nio.CharBuffer.wrap(injected))
    val payload = ByteArray(encoded.remaining()).also(encoded::get)
    val output = if (decoded.hadByteOrderMark) decoded.encoding.byteOrderMark + payload else payload
    return TypographyDocumentInjectionResult(output, decoded.encoding.wireValue, "injected")
  }

  private fun decode(data: ByteArray): DecodedDocument? {
    val (encoding, bomLength) = when {
      data.startsWith(SupportedEncoding.UTF8.byteOrderMark) -> SupportedEncoding.UTF8 to 3
      data.startsWith(SupportedEncoding.UTF16_LE.byteOrderMark) -> SupportedEncoding.UTF16_LE to 2
      data.startsWith(SupportedEncoding.UTF16_BE.byteOrderMark) -> SupportedEncoding.UTF16_BE to 2
      data.size >= 4 && data[0] == 0x3C.toByte() && data[1] == 0.toByte() &&
        data[2] == 0x3F.toByte() && data[3] == 0.toByte() -> SupportedEncoding.UTF16_LE to 0
      data.size >= 4 && data[0] == 0.toByte() && data[1] == 0x3C.toByte() &&
        data[2] == 0.toByte() && data[3] == 0x3F.toByte() -> SupportedEncoding.UTF16_BE to 0
      else -> SupportedEncoding.UTF8 to 0
    }
    return try {
      val text = encoding.charset.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(data, bomLength, data.size - bomLength))
        .toString()
      DecodedDocument(text, encoding, bomLength > 0)
    } catch (_: CharacterCodingException) {
      null
    }
  }

  private fun declarationIsSupported(text: String, detected: SupportedEncoding): Boolean {
    val declared = XML_ENCODING.find(text.take(512))?.groupValues?.get(1)
      ?.lowercase()?.replace('_', '-') ?: return true
    return when (declared) {
      "utf-8", "utf8" -> detected == SupportedEncoding.UTF8
      "utf-16", "utf16" -> detected != SupportedEncoding.UTF8
      "utf-16le", "utf16le" -> detected == SupportedEncoding.UTF16_LE
      "utf-16be", "utf16be" -> detected == SupportedEncoding.UTF16_BE
      else -> false
    }
  }

  private fun ByteArray.startsWith(prefix: ByteArray): Boolean =
    size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

  private data class DecodedDocument(
    val text: String,
    val encoding: SupportedEncoding,
    val hadByteOrderMark: Boolean,
  )

  private enum class SupportedEncoding(
    val wireValue: String,
    val charset: java.nio.charset.Charset,
    val byteOrderMark: ByteArray,
  ) {
    UTF8("utf-8", StandardCharsets.UTF_8, byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())),
    UTF16_LE("utf-16le", StandardCharsets.UTF_16LE, byteArrayOf(0xFF.toByte(), 0xFE.toByte())),
    UTF16_BE("utf-16be", StandardCharsets.UTF_16BE, byteArrayOf(0xFE.toByte(), 0xFF.toByte())),
  }
}
