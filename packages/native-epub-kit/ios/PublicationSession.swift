import Foundation
import ReadiumShared
import ReadiumStreamer
import UIKit

@MainActor
final class PublicationSession {
  let id = UUID().uuidString
  private(set) var publication: Publication?

  private let assetRetriever: AssetRetriever
  private let publicationOpener: PublicationOpener
  private let resourceLedger: PublicationSessionResourceLedger
  private let lifecycle = PublicationSessionLifecycle()
  private var ownedAsset: Asset?
  private var securityScopedURL: URL?

  init(
    assetRetriever: AssetRetriever,
    publicationOpener: PublicationOpener,
    resourceLedger: PublicationSessionResourceLedger
  ) {
    self.assetRetriever = assetRetriever
    self.publicationOpener = publicationOpener
    self.resourceLedger = resourceLedger
    resourceLedger.register(id)
    synchronizeResources()
  }

  isolated deinit {
    close()
  }

  func open(
    source: SharedPublicationSourceRecord,
    typographyProfile: ResolvedTypographyProfile?,
    sender: UIViewController?
  ) async throws -> Publication {
    do {
      try transition(to: .resolving)
      let resolvedSource = try PublicationSourceResolver.resolve(source).get()
      if
        let fileURL = resolvedSource.fileURL,
        fileURL.startAccessingSecurityScopedResource()
      {
        securityScopedURL = fileURL
        synchronizeResources()
      }

      try Task.checkCancellation()
      guard
        let sourceURL = URL(string: resolvedSource.retrievalUri),
        let absoluteURL = AnyURL(url: sourceURL).absoluteURL
      else {
        throw PublicationSourceResolver.unsupported("The publication source URI is invalid.")
      }

      try transition(to: .retrieving)
      let asset: Asset
      do {
        asset = try await assetRetriever.retrieve(url: absoluteURL).get()
      } catch {
        try Task.checkCancellation()
        throw PublicationSessionFailure(
          stableCode: .publicationOpenFailed,
          stablePhase: .open,
          message: "The file could not be opened as an EPUB publication.",
          recoverable: true
        )
      }
      ownedAsset = asset
      synchronizeResources()
      try Task.checkCancellation()

      try transition(to: .opening)
      let openedPublication: Publication
      do {
        openedPublication = try await publicationOpener.open(
          asset: asset,
          allowUserInteraction: true,
        onCreatePublication: { manifest, container, services in
          // The content iterator retries malformed XHTML indefinitely. Resource
          // search reports extraction errors and handles legacy multilingual EPUBs.
          services.setSearchServiceFactory(StringSearchService.makeFactory())
            guard manifest.metadata.layout != .fixed,
              typographyProfile?.publisherStyles.injectsProfileRules == true,
              let typographyProfile
            else {
              return
            }
            container = container.map { href, resource in
              guard TypographyStyleInjector.supports(path: href.string) else {
                return resource
              }
              return resource.map { data in
                TypographyDocumentCodec.inject(data, profile: typographyProfile).data
              }
            }
          },
          sender: sender
        ).get()
      } catch {
        try Task.checkCancellation()
        throw PublicationSessionFailure(
          stableCode: .publicationOpenFailed,
          stablePhase: .open,
          message: "The file could not be opened as an EPUB publication.",
          recoverable: true
        )
      }

      // Readium's Publication owns the successfully opened Asset.
      ownedAsset = nil
      publication = openedPublication
      synchronizeResources()
      try Task.checkCancellation()
      try transition(to: .ready)
      return openedPublication
    } catch is CancellationError {
      close()
      throw CancellationError()
    } catch let failure as PublicationSessionFailure {
      markFailed()
      close()
      throw failure
    } catch {
      let failure = PublicationSessionFailure(
        stableCode: .publicationOpenFailed,
        stablePhase: .open,
        message: "The EPUB publication could not be opened.",
        recoverable: true
      )
      markFailed()
      close()
      throw failure
    }
  }

  func close() {
    guard lifecycle.state != .closed else {
      return
    }
    if lifecycle.state != .closing {
      precondition(lifecycle.transition(to: .closing), "Invalid publication-session close")
      synchronizeResources()
    }

    publication?.close()
    publication = nil
    ownedAsset?.close()
    ownedAsset = nil
    securityScopedURL?.stopAccessingSecurityScopedResource()
    securityScopedURL = nil

    precondition(lifecycle.transition(to: .closed), "Invalid publication-session closure")
    synchronizeResources()
    resourceLedger.unregister(id, residentMemoryBytes: PublicationProcessMemory.residentBytes())
  }

  private func transition(to state: PublicationSessionLifecycleState) throws {
    guard lifecycle.transition(to: state) else {
      throw PublicationSessionFailure(
        stableCode: .nativeInvariantViolation,
        stablePhase: .open,
        message: "The publication session entered an invalid lifecycle state.",
        recoverable: false
      )
    }
    synchronizeResources()
  }

  private func markFailed() {
    if ![.failed, .closing, .closed].contains(lifecycle.state) {
      precondition(lifecycle.transition(to: .failed), "Invalid publication-session failure")
      synchronizeResources()
    }
  }

  private func synchronizeResources() {
    resourceLedger.update(
      id,
      state: lifecycle.state,
      ownsAsset: ownedAsset != nil,
      ownsPublication: publication != nil,
      ownsSourceLease: securityScopedURL != nil
    )
  }
}
