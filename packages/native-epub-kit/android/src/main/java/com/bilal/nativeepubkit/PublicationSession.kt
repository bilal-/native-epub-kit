@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.util.UUID
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.epub.EpubLayout
import org.readium.r2.shared.publication.presentation.presentation
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.Try
import org.readium.r2.shared.util.asset.Asset
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.resource.TransformingContainer
import org.readium.r2.shared.util.resource.TransformingResource
import org.readium.r2.streamer.PublicationOpener

internal class PublicationSession(
  private val assetRetriever: AssetRetriever,
  private val publicationOpener: PublicationOpener,
  private val sourceResolver: PublicationSourceResolver,
  private val resourceLedger: PublicationSessionResourceLedger,
) {
  val id: String = UUID.randomUUID().toString()
  var publication: Publication? = null
    private set

  private val lifecycle = PublicationSessionLifecycle()
  private var ownedAsset: Asset? = null

  init {
    resourceLedger.register(id)
    synchronizeResources()
  }

  suspend fun open(
    source: SharedPublicationSourceRecord,
    typographyProfile: ResolvedTypographyProfile?,
  ): Publication {
    try {
      transition(PublicationSessionLifecycleState.RESOLVING)
      val resolvedSource = sourceResolver.resolve(source).getOrThrow()
      currentCoroutineContext().ensureActive()
      val absoluteUrl = AbsoluteUrl(resolvedSource.retrievalUri)
        ?: throw PublicationSourceResolver.unsupported("The publication source URI is invalid.")

      transition(PublicationSessionLifecycleState.RETRIEVING)
      val asset = when (val result = assetRetriever.retrieve(absoluteUrl)) {
        is Try.Success -> result.value
        is Try.Failure -> throw PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.PUBLICATION_OPEN_FAILED,
          stablePhase = SharedReaderErrorPhase.OPEN,
          message = "The source could not be opened as an EPUB publication.",
          recoverable = true,
        )
      }
      ownedAsset = asset
      synchronizeResources()
      currentCoroutineContext().ensureActive()

      transition(PublicationSessionLifecycleState.OPENING)
      val openResult = publicationOpener.open(
        asset,
        allowUserInteraction = true,
        onCreatePublication = {
            val isReflowable = manifest.metadata.presentation.layout != EpubLayout.FIXED
            val injectTypography =
              typographyProfile?.publisherStyles?.injectsProfileRules == true
            if (isReflowable) {
              container = TransformingContainer(container) { href, resource ->
                if (!TypographyStyleInjector.supports(href.toString())) {
                  resource
                } else {
                  TransformingResource(resource) { bytes ->
                    var transformed = if (injectTypography) {
                      TypographyDocumentCodec.inject(bytes, requireNotNull(typographyProfile)).data
                    } else {
                      bytes
                    }
                    if (
                      transformed.size <=
                      ReaderWebViewResourcePolicy.MAXIMUM_REWRITABLE_HTML_BYTES
                    ) {
                      transformed = ReaderWebViewResourcePolicy
                        .deferImagesInDenseHtml(transformed)
                        .bytes
                    }
                    Try.success(transformed)
                  }
                }
              }
            }
        },
      )
      val openedPublication = when (openResult) {
        is Try.Success -> openResult.value
        is Try.Failure -> throw PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.PUBLICATION_OPEN_FAILED,
          stablePhase = SharedReaderErrorPhase.OPEN,
          message = "The source could not be opened as an EPUB publication.",
          recoverable = true,
        )
      }

      // Readium's Publication owns the successfully opened Asset.
      ownedAsset = null
      publication = openedPublication
      synchronizeResources()
      currentCoroutineContext().ensureActive()
      transition(PublicationSessionLifecycleState.READY)
      return openedPublication
    } catch (error: CancellationException) {
      close()
      throw error
    } catch (failure: PublicationSessionFailure) {
      markFailed()
      close()
      throw failure
    } catch (_: Throwable) {
      val failure = PublicationSessionFailure(
        stableCode = SharedReaderErrorCode.PUBLICATION_OPEN_FAILED,
        stablePhase = SharedReaderErrorPhase.OPEN,
        message = "The EPUB publication could not be opened.",
        recoverable = true,
      )
      markFailed()
      close()
      throw failure
    }
  }

  fun close() {
    if (lifecycle.state == PublicationSessionLifecycleState.CLOSED) return
    if (lifecycle.state != PublicationSessionLifecycleState.CLOSING) {
      check(lifecycle.transition(PublicationSessionLifecycleState.CLOSING)) {
        "Invalid publication-session close"
      }
      synchronizeResources()
    }

    publication?.close()
    publication = null
    ownedAsset?.close()
    ownedAsset = null

    check(lifecycle.transition(PublicationSessionLifecycleState.CLOSED)) {
      "Invalid publication-session closure"
    }
    synchronizeResources()
    resourceLedger.unregister(id, PublicationProcessMemory.residentBytes())
  }

  private fun transition(state: PublicationSessionLifecycleState) {
    if (!lifecycle.transition(state)) {
      throw PublicationSessionFailure(
        stableCode = SharedReaderErrorCode.NATIVE_INVARIANT_VIOLATION,
        stablePhase = SharedReaderErrorPhase.OPEN,
        message = "The publication session entered an invalid lifecycle state.",
        recoverable = false,
      )
    }
    synchronizeResources()
  }

  private fun markFailed() {
    if (
      lifecycle.state !in setOf(
        PublicationSessionLifecycleState.FAILED,
        PublicationSessionLifecycleState.CLOSING,
        PublicationSessionLifecycleState.CLOSED,
      )
    ) {
      check(lifecycle.transition(PublicationSessionLifecycleState.FAILED)) {
        "Invalid publication-session failure"
      }
      synchronizeResources()
    }
  }

  private fun synchronizeResources() {
    resourceLedger.update(
      id = id,
      state = lifecycle.state,
      ownsAsset = ownedAsset != null,
      ownsPublication = publication != null,
      ownsSourceLease = false,
    )
  }
}
