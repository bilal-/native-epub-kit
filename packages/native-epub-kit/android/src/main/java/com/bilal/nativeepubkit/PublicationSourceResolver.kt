package com.bilal.nativeepubkit

import android.content.ContentResolver
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.net.URI

internal class PublicationSessionFailure(
  val stableCode: SharedReaderErrorCode,
  val stablePhase: SharedReaderErrorPhase,
  override val message: String,
  val recoverable: Boolean,
) : Exception(message) {
  val code: String
    get() = stableCode.wireValue

  val phase: String
    get() = stablePhase.wireValue
}

internal data class ResolvedPublicationSource(
  val kind: SharedPublicationSourceKind,
  val retrievalUri: String,
)

internal fun interface ContentSourceProbe {
  fun validate(uri: String): PublicationSessionFailure?
}

internal class AndroidContentSourceProbe(
  private val contentResolver: ContentResolver,
) : ContentSourceProbe {
  override fun validate(uri: String): PublicationSessionFailure? {
    val androidUri = Uri.parse(uri)
    val mimeType = try {
      contentResolver.getType(androidUri)
    } catch (_: SecurityException) {
      return PublicationSourceResolver.permissionDenied()
    }
    if (mimeType != null && mimeType.lowercase() !in ACCEPTED_MIME_TYPES) {
      return PublicationSourceResolver.unsupported("The content URI is not an EPUB publication.")
    }

    try {
      val descriptor = contentResolver.openAssetFileDescriptor(androidUri, "r")
        ?: return PublicationSourceResolver.notFound()
      descriptor.use { }
    } catch (_: SecurityException) {
      return PublicationSourceResolver.permissionDenied()
    } catch (_: FileNotFoundException) {
      return PublicationSourceResolver.notFound()
    } catch (_: Exception) {
      return PublicationSourceResolver.permissionDenied()
    }
    return null
  }

  private companion object {
    val ACCEPTED_MIME_TYPES = setOf(
      "application/epub+zip",
      "application/octet-stream",
      "application/zip",
    )
  }
}

internal class PublicationSourceResolver(
  private val contentSourceProbe: ContentSourceProbe,
) {
  fun resolveLegacyUri(value: String): Result<ResolvedPublicationSource> {
    val trimmed = value.trim()
    val uri = try {
      URI(trimmed)
    } catch (_: Exception) {
      return Result.failure(unsupported("The publication source URI is invalid."))
    }
    if (trimmed.isEmpty() || !uri.isAbsolute) {
      return Result.failure(unsupported("The publication source URI is invalid."))
    }

    return when (uri.scheme?.lowercase()) {
      "file" -> resolveFile(uri)
      "content" -> resolveContent(trimmed)
      "http", "https" -> Result.failure(remoteUnsupported())
      else -> Result.failure(unsupported("The publication source scheme is unsupported."))
    }
  }

  fun resolve(record: SharedPublicationSourceRecord): Result<ResolvedPublicationSource> =
    when (record.kind) {
      SharedPublicationSourceKind.FILE -> resolveLegacyUri(record.json.getString("uri"))
      SharedPublicationSourceKind.CONTENT -> resolveContent(record.json.getString("uri"))
      SharedPublicationSourceKind.REMOTE -> Result.failure(remoteUnsupported())
    }

  private fun resolveFile(uri: URI): Result<ResolvedPublicationSource> {
    val file = try {
      File(uri).canonicalFile
    } catch (_: Exception) {
      return Result.failure(unsupported("The local publication URI is invalid."))
    }

    if (!file.exists()) return Result.failure(notFound())
    if (!file.isFile) {
      return Result.failure(unsupported("The source is not a regular EPUB file."))
    }
    if (!file.name.endsWith(".epub", ignoreCase = true)) {
      return Result.failure(unsupported("Only EPUB files are supported."))
    }
    if (!file.canRead()) return Result.failure(permissionDenied())
    try {
      FileInputStream(file).use { }
    } catch (_: Exception) {
      return Result.failure(permissionDenied())
    }

    return Result.success(
      ResolvedPublicationSource(
        kind = SharedPublicationSourceKind.FILE,
        retrievalUri = file.toURI().toString(),
      )
    )
  }

  private fun resolveContent(uri: String): Result<ResolvedPublicationSource> {
    val parsed = try {
      URI(uri)
    } catch (_: Exception) {
      return Result.failure(unsupported("The Android content URI is invalid."))
    }
    if (!parsed.isAbsolute || parsed.scheme?.lowercase() != "content") {
      return Result.failure(unsupported("The Android content URI is invalid."))
    }
    contentSourceProbe.validate(uri)?.let { return Result.failure(it) }
    return Result.success(
      ResolvedPublicationSource(
        kind = SharedPublicationSourceKind.CONTENT,
        retrievalUri = uri,
      )
    )
  }

  companion object {
    fun unsupported(message: String) = PublicationSessionFailure(
      stableCode = SharedReaderErrorCode.UNSUPPORTED_FORMAT,
      stablePhase = SharedReaderErrorPhase.SOURCE,
      message = message,
      recoverable = true,
    )

    fun permissionDenied() = PublicationSessionFailure(
      stableCode = SharedReaderErrorCode.SOURCE_PERMISSION_DENIED,
      stablePhase = SharedReaderErrorPhase.SOURCE,
      message = "The EPUB source is not readable.",
      recoverable = true,
    )

    fun notFound() = PublicationSessionFailure(
      stableCode = SharedReaderErrorCode.SOURCE_NOT_FOUND,
      stablePhase = SharedReaderErrorPhase.SOURCE,
      message = "The EPUB source does not exist.",
      recoverable = true,
    )

    fun remoteUnsupported() = unsupported(
      "Remote publication sources are experimental and disabled in this release."
    )
  }
}
