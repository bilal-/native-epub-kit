package com.bilal.nativeepubkit

import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeFalse
import org.junit.Test

class PublicationSourceResolverTest {
  private val resolver = PublicationSourceResolver(ContentSourceProbe { null })

  @Test
  fun acceptsReadableLocalEpub() {
    val source = Files.createTempFile("native-epub-kit", ".epub").toFile()
    source.writeText("qualification")

    assertEquals(
      SharedPublicationSourceKind.FILE,
      resolver.resolveLegacyUri(source.toURI().toString()).getOrThrow().kind,
    )
  }

  @Test
  fun classifiesMissingUnsupportedAndRemoteSources() {
    val missing = Files.createTempDirectory("native-epub-kit").resolve("missing.epub")
    val unsupported = Files.createTempFile("native-epub-kit", ".txt").toFile().apply {
      writeText("qualification")
    }

    assertEquals(
      "SOURCE_NOT_FOUND",
      failure(missing.toUri().toString()).code
    )
    assertEquals(
      "UNSUPPORTED_FORMAT",
      failure(unsupported.toURI().toString()).code
    )
    assertEquals(
      "UNSUPPORTED_FORMAT",
      failure("https://example.invalid/book.epub").code
    )
  }

  @Test
  fun acceptsContentUriThroughTheInjectedAndroidProbe() {
    val source = resolver.resolveLegacyUri("content://example.invalid/library/book").getOrThrow()

    assertEquals(SharedPublicationSourceKind.CONTENT, source.kind)
    assertEquals("content://example.invalid/library/book", source.retrievalUri)
  }

  @Test
  fun preservesContentProbeFailure() {
    val deniedResolver = PublicationSourceResolver(
      ContentSourceProbe { PublicationSourceResolver.permissionDenied() }
    )

    assertEquals(
      "SOURCE_PERMISSION_DENIED",
      deniedResolver.resolveLegacyUri("content://example.invalid/book").exceptionOrNull()
        ?.let { it as PublicationSessionFailure }
        ?.code,
    )
  }

  @Test
  fun resolvesStableFileAndContentRecordsAndRejectsRemoteRecord() {
    val file = Files.createTempFile("native-epub-kit-record", ".epub").toFile().apply {
      writeText("record")
    }
    val fileRecord = SharedCoreRecordCodec.decode(
      SharedCoreRecordType.PUBLICATION_SOURCE,
      JSONObject().put("kind", "file").put("uri", file.toURI().toString()),
    ) as SharedPublicationSourceRecord
    val contentRecord = SharedCoreRecordCodec.decode(
      SharedCoreRecordType.PUBLICATION_SOURCE,
      JSONObject().put("kind", "content").put("uri", "content://example.invalid/book"),
    ) as SharedPublicationSourceRecord
    val remoteRecord = SharedCoreRecordCodec.decode(
      SharedCoreRecordType.PUBLICATION_SOURCE,
      JSONObject().put("kind", "remote").put("url", "https://example.invalid/book.epub"),
    ) as SharedPublicationSourceRecord

    assertEquals(SharedPublicationSourceKind.FILE, resolver.resolve(fileRecord).getOrThrow().kind)
    assertEquals(
      SharedPublicationSourceKind.CONTENT,
      resolver.resolve(contentRecord).getOrThrow().kind,
    )
    assertEquals(
      "UNSUPPORTED_FORMAT",
      (resolver.resolve(remoteRecord).exceptionOrNull() as PublicationSessionFailure).code,
    )
  }

  @Test
  fun classifiesUnreadableSourceWhenPosixPermissionsAreEnforced() {
    val path = Files.createTempFile("native-epub-kit", ".epub")
    Files.write(path, "qualification".toByteArray())
    Files.setPosixFilePermissions(path, emptySet<PosixFilePermission>())
    val source = path.toFile()
    assumeFalse("Test host bypasses POSIX read permissions", source.canRead())

    assertEquals(
      "SOURCE_PERMISSION_DENIED",
      failure(source.toURI().toString()).code
    )
  }

  private fun failure(value: String): PublicationSessionFailure =
    resolver.resolveLegacyUri(value).exceptionOrNull() as PublicationSessionFailure
}
