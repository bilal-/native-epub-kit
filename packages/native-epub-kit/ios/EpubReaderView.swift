import ExpoModulesCore
import Foundation
@_spi(ExperimentalTargetElement) import ReadiumNavigator
import ReadiumShared
import ReadiumStreamer
import UIKit

private enum NativeReaderImagePayload {
  case publicationResource(ReadiumShared.Link)
  case inlineSVG(Data)
}

private struct NativeReaderImageSource {
  let contentType: String
  let generation: Int
  let payload: NativeReaderImagePayload
}

@MainActor
final class EpubReaderView: ExpoView, EPUBNavigatorDelegate {
  let onDecorationPress = EventDispatcher()
  let onFootnotePress = EventDispatcher()
  let onImagePress = EventDispatcher()
  let onLinkPress = EventDispatcher()
  let onLocationChange = EventDispatcher()
  let onNavigationAction = EventDispatcher()
  let onNavigationPolicyChange = EventDispatcher()
  let onNavigationUnitBoundary = EventDispatcher()
  let onPreferencesChange = EventDispatcher()
  let onProgress = EventDispatcher()
  let onReaderState = EventDispatcher()
  let onSelectionAction = EventDispatcher()
  let onSelectionChange = EventDispatcher()
  let onTypographyDiagnostics = EventDispatcher()

  private let statusLabel = UILabel()
  private let httpClient = DefaultHTTPClient()
  private lazy var assetRetriever = AssetRetriever(httpClient: httpClient)
  private lazy var publicationOpener = PublicationOpener(
    parser: DefaultPublicationParser(
      httpClient: httpClient,
      assetRetriever: assetRetriever,
      pdfFactory: DefaultPDFDocumentFactory()
    )
  )

  private var publicationSource: SharedPublicationSourceRecord?
  private var sourceJsonFingerprint: String?
  private var sourceValidationFailure: PublicationSessionFailure?
  private let installedFonts = NativeFontRegistry.load()
  private var generation = 0
  private let eventGate = ReaderLifecycleGate()
  private let stableEventProtocol = ReaderEventProtocol()
  private let instanceId = UUID().uuidString
  private var currentReaderState = StableReaderState.idle
  private var isMounted = false
  private var openTask: Task<Void, Never>?
  private let sessionResources = PublicationSessionResourceLedger()
  private let searchCoordinator = ReaderSearchCoordinator()
  private var openingSession: PublicationSession?
  private var activeSession: PublicationSession?
  private var publication: Publication? { activeSession?.publication }
  private var navigator: EPUBNavigatorViewController?
  private var configuredInitialLocation: Locator?
  private var configuredNavigationPolicy = ResolvedReaderNavigationPolicy.defaults
  private var configuredNavigationUnitBoundaryKey: String?
  private var configuredNavigationUnitBoundariesRequired = false
  private var configuredPreferences = ResolvedReaderPreferences.defaults
  private var configuredSelectionActions: [ResolvedNativeSelectionAction] = []
  private var configuredTypographyProfile: ResolvedTypographyProfile?
  private var decorationGroups: [String: [ResolvedNativeDecoration]] = [:]
  private var observedDecorationGroups: Set<String> = []
  private var configuredFootnotePolicy = FootnoteLinkPolicy.defaultFootnote
  private var configuredImagePolicy = ReaderImagePolicy.default
  private var configuredLinkPolicy = FootnoteLinkPolicy.defaultLinks
  private var pendingInitialLocation: Locator?
  private var pendingInitialLocationReason: StableReaderLocationReason?
  private var firstLocationReason = StableReaderLocationReason.initial.rawValue
  private var typographyDiagnosticTask: Task<Void, Never>?
  private var selectionActionTask: Task<Void, Never>?
  private var selectionMonitorTask: Task<Void, Never>?
  private var latestSelectionSnapshot: [String: Any]?
  private var latestSelectionFingerprint: String?
  private var latestNativeSelectionFingerprint: String?
  private var selectionLifecycleStarted = false
  private var footnoteEventTask: Task<Void, Never>?
  private var linkEventTask: Task<Void, Never>?
  private var imageEventTask: Task<Void, Never>?
  private var progressEventTask: Task<Void, Never>?
  private var publicationDataTask: Task<Void, Never>?
  private var navigationTask: Task<Void, Never>?
  private var preferenceUpdateTask: Task<Void, Never>?
  private var preferenceUpdateSerial = 0
  private var diagnosedGenerations: Set<Int> = []
  private var progressProbeSignal = 0
  private var nextResourceSignal = 0
  private var progressReadyGeneration: Int?
  private var initialProgressGeneration: Int?
  private var totalPositionCount: Int?
  private var publicationData: PublicationDataSnapshot?
  private var nativePositions: [Locator] = []
  private var publicationDataMappingDurationMilliseconds = 0
  private var navigationActivitySerial = 0
  private var activeNavigationCommandId: Int?
  private var programmaticNavigationActivityIds: Set<Int> = []
  private var programmaticNavigationAuthorizationTarget: Locator?
  private var programmaticNavigationAuthorizationTask: Task<Void, Never>?
  private var isProgrammaticNavigationInFlight: Bool {
    !programmaticNavigationActivityIds.isEmpty
  }
  private var latestStableLocation: [String: Any]?
  private var latestPreferencesStatus: [String: Any]?
  private var latestNavigationPolicyStatus: [String: Any]?
  private var navigationPolicyApplication = "initial"
  private var directionalNavigationAdapter: DirectionalNavigationAdapter?
  private var imageInputObserver: ReaderImageInputObserver?
  private var imageInputObserverToken: InputObservableToken?
  private var paginatedDragObserver: DragPointerObserver?
  private var paginatedDragObserverToken: InputObservableToken?
  private var imageSources: [String: NativeReaderImageSource] = [:]
  private var resolvedImageFiles: [String: URL] = [:]
  private var acceptedUserLocation: Locator?
  private var navigationUnitBoundaryConfiguration: ReaderNavigationUnitBoundaryConfiguration?
  private var acceptedNavigationUnitMatch: ReaderNavigationUnitBoundaryMatch?
  private var gestureRollbackTask: Task<Void, Never>?
  private var viewportResizeTarget: Locator?
  private var viewportResizeGuardTask: Task<Void, Never>?
  private var lastViewportSize = CGSize.zero
  private var paginatedDragAnchor: Locator?
  private var scrolledSwipeStart: CGPoint?
  private var paginatedDragCandidate: Locator?
  private var paginatedDragInProgress = false
  private var paginatedDragSettlementTask: Task<Void, Never>?
  private var pendingUserLocationReason = StableReaderLocationReason.userScroll.rawValue

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.89, alpha: 1)

    statusLabel.text = "Waiting for an EPUB"
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0
    statusLabel.textColor = UIColor(red: 0.08, green: 0.13, blue: 0.24, alpha: 1)
    statusLabel.accessibilityIdentifier = "native-epub-kit-reader-state"
    addSubview(statusLabel)
  }

  deinit {
    openTask?.cancel()
    typographyDiagnosticTask?.cancel()
    selectionActionTask?.cancel()
    selectionMonitorTask?.cancel()
    footnoteEventTask?.cancel()
    linkEventTask?.cancel()
    imageEventTask?.cancel()
    progressEventTask?.cancel()
    publicationDataTask?.cancel()
    navigationTask?.cancel()
    preferenceUpdateTask?.cancel()
    gestureRollbackTask?.cancel()
    programmaticNavigationAuthorizationTask?.cancel()
    viewportResizeGuardTask?.cancel()
    paginatedDragSettlementTask?.cancel()
    MainActor.assumeIsolated {
      searchCoordinator.cancelAll()
    }
  }

  override func layoutSubviews() {
    let previousSize = lastViewportSize
    lastViewportSize = bounds.size
    super.layoutSubviews()
    if previousSize.width > 0,
       previousSize.height > 0,
       bounds.width > 0,
       bounds.height > 0,
       previousSize != bounds.size,
       currentReaderState == .ready,
       !isProgrammaticNavigationInFlight,
       preferenceUpdateTask == nil,
       gestureRollbackTask == nil,
       let acceptedUserLocation
    {
      guardViewportResize(at: acceptedUserLocation)
    }
    navigator?.view.frame = bounds
    statusLabel.frame = bounds.insetBy(dx: 24, dy: 24)
    bringSubviewToFront(statusLabel)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      stopForUnmount()
    } else if !isMounted {
      isMounted = true
      startCurrentSource()
    } else {
      attachNavigatorIfPossible()
    }
  }

  func setSourceJson(_ value: String?) {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let requestJson = normalized?.isEmpty == false ? normalized : nil else {
      guard
        sourceJsonFingerprint != nil || publicationSource != nil || sourceValidationFailure != nil
      else {
        return
      }
      sourceJsonFingerprint = nil
      publicationSource = nil
      sourceValidationFailure = nil
      configuredInitialLocation = nil
      configuredNavigationPolicy = .defaults
      configuredNavigationUnitBoundariesRequired = false
      configuredNavigationUnitBoundaryKey = nil
      configuredPreferences = .defaults
      configuredSelectionActions = []
      configuredTypographyProfile = nil
      clearDecorationState()
      pendingInitialLocation = nil
      pendingInitialLocationReason = nil
      latestPreferencesStatus = nil
      latestNavigationPolicyStatus = nil
      navigationPolicyApplication = "initial"
      restartSession()
      return
    }

    let request: ReaderOpenRequest
    do {
      request = try ReaderOpenRequest(
        jsonString: requestJson,
        availableFontFamilies: Set(installedFonts.map(\.family))
      )
    } catch let error as ReaderOpenRequestError {
      let invalidFingerprint = "invalid:\(requestJson)"
      guard sourceJsonFingerprint != invalidFingerprint else {
        return
      }
      sourceJsonFingerprint = invalidFingerprint
      publicationSource = nil
      configuredInitialLocation = nil
      configuredNavigationPolicy = .defaults
      configuredNavigationUnitBoundariesRequired = false
      configuredNavigationUnitBoundaryKey = nil
      configuredPreferences = .defaults
      configuredSelectionActions = []
      configuredTypographyProfile = nil
      clearDecorationState()
      pendingInitialLocation = nil
      pendingInitialLocationReason = nil
      sourceValidationFailure = switch error {
      case .invalidLocator:
        PublicationSessionFailure(
          stableCode: .invalidLocator,
          stablePhase: .navigate,
          message: "The initial locator record is invalid.",
          recoverable: true
        )
      case .invalidNavigationPolicy:
        PublicationSessionFailure(
          stableCode: .nativeInvariantViolation,
          stablePhase: .render,
          message: "The reader navigation policy record is invalid.",
          recoverable: false
        )
      case .invalidPreferences:
        PublicationSessionFailure(
          stableCode: .nativeInvariantViolation,
          stablePhase: .render,
          message: "The reader preferences record is invalid.",
          recoverable: false
        )
      case .invalidSelectionActions:
        PublicationSessionFailure(
          stableCode: .nativeInvariantViolation,
          stablePhase: .render,
          message: "The selection action configuration is invalid.",
          recoverable: false
        )
      case .invalidTypographyProfile:
        PublicationSessionFailure(
          stableCode: .typographyConfigurationFailed,
          stablePhase: .render,
          message: "The typography profile record is invalid or references an unavailable font.",
          recoverable: true
        )
      case .invalidSource:
        PublicationSourceResolver.unsupported("The publication source record is invalid.")
      }
      restartSession()
      return
    } catch {
      return
    }

    let sourceChanged = sourceJsonFingerprint != request.sourceFingerprint
      || sourceValidationFailure != nil
    let initialLocationChanged = configuredInitialLocation != request.initialLocator
    let previousNavigationPolicy = configuredNavigationPolicy
    let navigationPolicyChanged = previousNavigationPolicy != request.navigationPolicy
    let navigationUnitBoundaryRequirementChanged =
      configuredNavigationUnitBoundariesRequired != request.navigationUnitBoundariesRequired
        || configuredNavigationUnitBoundaryKey != request.navigationUnitBoundaryKey
    let previousPreferences = configuredPreferences
    let preferencesChanged = previousPreferences != request.preferences
    let selectionActionsChanged = configuredSelectionActions != request.selectionActions
    let typographyProfileChanged = configuredTypographyProfile != request.typographyProfile
    sourceJsonFingerprint = request.sourceFingerprint
    publicationSource = request.source
    sourceValidationFailure = nil
    configuredInitialLocation = request.initialLocator
    configuredNavigationPolicy = request.navigationPolicy
    configuredNavigationUnitBoundariesRequired = request.navigationUnitBoundariesRequired
    configuredNavigationUnitBoundaryKey = request.navigationUnitBoundaryKey
    configuredPreferences = request.preferences
    configuredSelectionActions = request.selectionActions
    configuredTypographyProfile = request.typographyProfile
    if sourceChanged {
      clearDecorationState()
    }

    guard sourceChanged else {
      if currentReaderState == .ready {
        if typographyProfileChanged || selectionActionsChanged {
          pendingInitialLocation = navigator?.currentLocation
          pendingInitialLocationReason = pendingInitialLocation == nil ? nil : .preferenceChange
          restartSession()
          return
        }
        if navigationPolicyChanged {
          applyNavigationPolicy(previous: previousNavigationPolicy)
          if ReaderNavigationPolicy.requiresNavigatorRecreation(
            previous: previousNavigationPolicy,
            next: request.navigationPolicy
          ) {
            return
          }
        }
        if preferencesChanged {
          applyPreferences(previous: previousPreferences)
        }
        if navigationUnitBoundaryRequirementChanged {
          navigationUnitBoundaryConfiguration = nil
          acceptedNavigationUnitMatch = nil
          emitNavigationPolicyStatus()
        }
        return
      }
      guard
        initialLocationChanged || navigationPolicyChanged || preferencesChanged
          || typographyProfileChanged || selectionActionsChanged
          || navigationUnitBoundaryRequirementChanged
      else { return }
      pendingInitialLocation = request.initialLocator
      pendingInitialLocationReason = request.initialLocator == nil ? nil : .restored
      restartSession()
      return
    }

    pendingInitialLocation = request.initialLocator
    pendingInitialLocationReason = request.initialLocator == nil ? nil : .restored
    navigationPolicyApplication = "initial"
    restartSession()
  }

  func setFootnotePolicyJson(_ value: String?) {
    configuredFootnotePolicy =
      (try? FootnoteLinkPolicy.resolveFootnote(json: value)) ?? FootnoteLinkPolicy.defaultFootnote
  }

  func setLinkPolicyJson(_ value: String?) {
    configuredLinkPolicy =
      (try? FootnoteLinkPolicy.resolveLinks(json: value)) ?? FootnoteLinkPolicy.defaultLinks
  }

  func setImagePolicyJson(_ value: String?) {
    configuredImagePolicy =
      (try? ReaderImagePolicy.resolve(json: value)) ?? ReaderImagePolicy.default
  }

  func setProgressProbeSignal(_ value: Int?) {
    guard let value, value != progressProbeSignal else {
      return
    }
    progressProbeSignal = value
    emitProgress(reason: "probe")
  }

  func setNextResourceSignal(_ value: Int?) {
    guard let value, value != nextResourceSignal else {
      return
    }
    nextResourceSignal = value
    navigateToNextResource()
  }

  private func clearDecorationState() {
    if let navigator {
      for group in decorationGroups.keys {
        navigator.apply(decorations: [], in: group)
      }
    }
    decorationGroups.removeAll()
  }

  private func restoreDecorations(on navigator: EPUBNavigatorViewController) {
    observedDecorationGroups.removeAll()
    for group in decorationGroups.keys.sorted() {
      guard let records = decorationGroups[group] else { continue }
      observeDecorationInteractions(in: group, on: navigator)
      guard let decorations = try? records.map(NativeDecorationRenderer.readiumDecoration) else {
        continue
      }
      navigator.apply(decorations: decorations, in: group)
    }
  }

  private func observeDecorationInteractions(
    in group: String,
    on expectedNavigator: EPUBNavigatorViewController
  ) {
    guard observedDecorationGroups.insert(group).inserted else { return }
    expectedNavigator.observeDecorationInteractions(inGroup: group) {
      [weak self, weak expectedNavigator] event in
      MainActor.assumeIsolated {
        guard let self, let expectedNavigator, expectedNavigator === self.navigator else { return }
        self.emitDecorationActivation(event, navigator: expectedNavigator)
      }
    }
  }

  private func emitDecorationActivation(
    _ event: OnDecorationActivatedEvent,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) {
    guard
      expectedNavigator === navigator,
      let decoration = decorationGroups[event.group]?.first(where: { $0.id == event.decoration.id }),
      let sequence = stableEventProtocol.nextEvent(generation: generation)
    else {
      return
    }
    var payload: [String: Any] = [
      "decoration": decoration.jsonObject,
      "generation": generation,
      "group": event.group,
      "instanceId": instanceId,
      "platform": "ios",
      "sequence": sequence,
    ]
    if let geometry = decorationGeometry(
      rect: event.rect,
      point: event.point,
      navigator: expectedNavigator
    ) {
      payload["geometry"] = geometry
    }
    onDecorationPress(payload)
  }

  private func decorationGeometry(
    rect: CGRect?,
    point: CGPoint?,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) -> [String: Any]? {
    let nativeRect = (rect?.standardized).flatMap { $0.isFinite ? $0 : nil }
      ?? point.flatMap {
        let candidate = CGRect(x: $0.x, y: $0.y, width: 0, height: 0)
        return candidate.isFinite ? candidate : nil
      }
    guard
      let nativeRect,
      let window,
      bounds.width > 0,
      bounds.height > 0
    else { return nil }
    let viewRect = expectedNavigator.view.convert(nativeRect, to: self)
    let windowRect = expectedNavigator.view.convert(nativeRect, to: window)
    guard viewRect.isFinite, windowRect.isFinite, bounds.isFinite else { return nil }
    let intersection = viewRect.intersection(bounds)
    let visibleViewRect: CGRect
    if intersection.isNull || !intersection.isFinite {
      visibleViewRect = CGRect(
        x: min(max(viewRect.minX, bounds.minX), bounds.maxX),
        y: min(max(viewRect.minY, bounds.minY), bounds.maxY),
        width: 0,
        height: 0
      )
    } else {
      visibleViewRect = intersection
    }
    let visibleWindowRect = convert(visibleViewRect, to: window)
    guard visibleWindowRect.isFinite else { return nil }
    return [
      "coordinateSpace": "reader-view-and-window-v1",
      "viewRect": viewRect.eventPayload,
      "visibleViewRect": visibleViewRect.eventPayload,
      "viewport": ["height": bounds.height, "width": bounds.width],
      "windowRect": windowRect.eventPayload,
      "visibleWindowRect": visibleWindowRect.eventPayload,
    ]
  }

  private func configureImageActivationObserver() {
    guard let navigator else { return }
    if let imageInputObserverToken {
      navigator.removeObserver(imageInputObserverToken)
    }
    let observer = ReaderImageInputObserver { [weak self, weak navigator] target in
      guard let self, let navigator, navigator === self.navigator else { return }
      self.scheduleImageActivation(target, navigator: navigator)
    }
    imageInputObserver = observer
    imageInputObserverToken = navigator.addObserver(observer)
  }

  private func configurePaginatedDragObserver() {
    guard let navigator else { return }
    if let paginatedDragObserverToken {
      navigator.removeObserver(paginatedDragObserverToken)
    }
    let observer = DragPointerObserver(
      onStart: { [weak self] event in
        self?.scrolledSwipeStart = event.location
        self?.beginPaginatedDrag()
        return false
      },
      onMove: { _ in false },
      onEnd: { [weak self] event in
        self?.finishScrolledChapterSwipe(at: event.location)
        self?.finishPaginatedDrag()
        return false
      },
      onCancel: { [weak self] _ in
        self?.scrolledSwipeStart = nil
        self?.finishPaginatedDrag()
        return false
      }
    )
    paginatedDragObserver = observer
    paginatedDragObserverToken = navigator.addObserver(observer)
  }

  private func scheduleImageActivation(
    _ target: PointerEvent.TargetElement,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) {
    let expectedGeneration = generation
    imageEventTask?.cancel()
    imageEventTask = Task { [weak self, weak expectedNavigator] in
      guard let self, let expectedNavigator else { return }
      let metadata = await imageMetadata(
        for: target.content,
        navigator: expectedNavigator
      )
      guard
        !Task.isCancelled,
        isCurrent(expectedGeneration),
        expectedNavigator === navigator,
        let sequence = stableEventProtocol.nextEvent(generation: expectedGeneration),
        let locator = jsonObject(for: target.content.locator)
      else {
        return
      }

      var payload: [String: Any] = [
        "generation": expectedGeneration,
        "instanceId": instanceId,
        "locator": locator,
        "platform": "ios",
        "rights": [
          "canShare": configuredImagePolicy.allowSharing,
          "canZoom": configuredImagePolicy.allowZoom,
        ],
        "sequence": sequence,
        "source": imageSourceValue(for: target.content),
      ]
      if let alt = metadata.alt { payload["alt"] = alt }
      if let caption = metadata.caption { payload["caption"] = caption }
      if let geometry = decorationGeometry(
        rect: target.frame,
        point: nil,
        navigator: expectedNavigator
      ) {
        payload["geometry"] = geometry
      }
      guard
        let data = try? JSONSerialization.data(withJSONObject: payload),
        let value = try? JSONDecoder().decode(SharedJSONValue.self, from: data),
        (try? SharedReaderImageActivationEventRecord(validating: value)) != nil
      else {
        return
      }
      onImagePress(payload)
      imageEventTask = nil
    }
  }

  private func imageMetadata(
    for content: any ContentElement,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) async -> (alt: String?, caption: String?) {
    let fallback: (alt: String?, caption: String?)
    if let image = content as? ImageContentElement {
      fallback = (
        boundedImageText(image.accessibilityLabel),
        boundedImageText(image.caption)
      )
    } else if let svg = content as? SVGContentElement {
      fallback = (
        boundedImageText(svg.accessibilityLabel),
        boundedImageText(svg.caption)
      )
    } else {
      return (nil, nil)
    }
    guard
      let selector = content.locator.locations.cssSelector,
      let selectorData = try? JSONSerialization.data(
        withJSONObject: selector,
        options: [.fragmentsAllowed]
      )
    else {
      return fallback
    }
    let selectorLiteral = String(decoding: selectorData, as: UTF8.self)
    let script = """
    (() => {
      const element = document.querySelector(\(selectorLiteral));
      if (!element) return null;
      const trimmed = (value) => {
        const result = typeof value === 'string' ? value.trim() : '';
        return result || null;
      };
      const figure = element.closest('figure');
      const figureCaption = figure ? figure.querySelector('figcaption') : null;
      const title = element.querySelector(':scope > title');
      const description = element.querySelector(':scope > desc');
      return {
        alt: trimmed(element.getAttribute('alt')) || trimmed(element.getAttribute('aria-label')),
        caption: trimmed(figureCaption && figureCaption.textContent)
          || trimmed(element.getAttribute('title'))
          || trimmed(title && title.textContent)
          || trimmed(description && description.textContent),
      };
    })();
    """
    guard
      case let .success(raw) = await expectedNavigator.evaluateJavaScript(script),
      let result = raw as? [String: Any]
    else {
      return fallback
    }
    return (
      boundedImageText(result["alt"] as? String) ?? fallback.alt,
      boundedImageText(result["caption"] as? String) ?? fallback.caption
    )
  }

  private func imageSourceValue(for content: any ContentElement) -> [String: Any] {
    if let image = content as? ImageContentElement {
      let link = image.embeddedLink
      let href = boundedImageText(link.url().string, maximumUTF16Units: 4_096)
        ?? link.url().string
      let contentType = imageContentType(
        declared: link.mediaType?.string,
        href: href
      )
      if let scheme = URL(string: href)?.scheme?.lowercased(), !scheme.isEmpty {
        return [
          "contentType": contentType,
          "href": href,
          "kind": "external",
          "resolvable": false,
          "unresolvedReason": "external-resource",
        ]
      }
      guard let publication, let resource = publication.get(link) else {
        return [
          "contentType": contentType,
          "href": href,
          "kind": "publication-resource",
          "resolvable": false,
          "unresolvedReason": "resource-not-found",
        ]
      }
      resource.close()
      guard let handle = registerImageSource(
        contentType: contentType,
        payload: .publicationResource(link)
      ) else {
        return [
          "contentType": contentType,
          "href": href,
          "kind": "publication-resource",
          "resolvable": false,
          "unresolvedReason": "unsupported-source",
        ]
      }
      return [
        "contentType": contentType,
        "handle": handle,
        "href": href,
        "kind": "publication-resource",
        "resolvable": true,
      ]
    }
    if let svg = content as? SVGContentElement {
      let data = Data(svg.svg.utf8)
      guard data.count <= Self.maximumResolvedImageBytes else {
        return [
          "contentType": "image/svg+xml",
          "kind": "inline-svg",
          "resolvable": false,
          "unresolvedReason": "source-too-large",
        ]
      }
      guard let handle = registerImageSource(
        contentType: "image/svg+xml",
        payload: .inlineSVG(data)
      ) else {
        return [
          "contentType": "image/svg+xml",
          "kind": "inline-svg",
          "resolvable": false,
          "unresolvedReason": "unsupported-source",
        ]
      }
      return [
        "contentType": "image/svg+xml",
        "handle": handle,
        "kind": "inline-svg",
        "resolvable": true,
      ]
    }
    return [
      "kind": "inline-svg",
      "resolvable": false,
      "unresolvedReason": "unsupported-source",
    ]
  }

  private func registerImageSource(
    contentType: String,
    payload: NativeReaderImagePayload
  ) -> String? {
    guard imageSources.count < Self.maximumImageSourceHandles else { return nil }
    let handle = UUID().uuidString
    imageSources[handle] = NativeReaderImageSource(
      contentType: contentType,
      generation: generation,
      payload: payload
    )
    return handle
  }

  private func boundedImageText(
    _ value: String?,
    maximumUTF16Units: Int = 4_096
  ) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if trimmed.utf16.count <= maximumUTF16Units { return trimmed }
    return String(decoding: Array(trimmed.utf16.prefix(maximumUTF16Units)), as: UTF16.self)
  }

  private func imageContentType(declared: String?, href: String) -> String {
    if let declared = declared?.lowercased(), declared.hasPrefix("image/"), declared.count <= 128 {
      return declared
    }
    switch href.lowercased().split(separator: "?").first?.split(separator: ".").last {
    case "gif": return "image/gif"
    case "jpg", "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "svg": return "image/svg+xml"
    case "webp": return "image/webp"
    default: return "image/octet-stream"
    }
  }

  private func clearImageResources() {
    imageSources.removeAll()
    for url in resolvedImageFiles.values {
      try? FileManager.default.removeItem(at: url)
    }
    resolvedImageFiles.removeAll()
    try? FileManager.default.removeItem(at: imageResourceDirectory)
  }

  private var imageResourceDirectory: URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("native-epub-kit-images-\(instanceId)", isDirectory: true)
  }

  private static let maximumResolvedImageBytes = 32 * 1_024 * 1_024
  private static let maximumResolvedImageFiles = 32
  private static let maximumImageSourceHandles = 256
  // UIKit's paginated navigator can publish the first visible resource before
  // the destination resource of a completed page turn. Keep the drag
  // transaction open long enough to evaluate the settled spread.
  private static let paginatedDragSettlementNanoseconds: UInt64 = 500_000_000
  private static let gestureRollbackSettlementNanoseconds: UInt64 = 1_000_000_000
  private static let viewportResizeGuardNanoseconds: UInt64 = 1_000_000_000

  private func restartSession() {
    endSelection(reason: "dismissed")
    let cancelledGeneration = invalidateCurrentGeneration()
    emitClosingIfNeeded(generation: cancelledGeneration)
    tearDownNavigator()

    guard isMounted else {
      emitState("unmounted")
      return
    }
    startCurrentSource()
  }

  private func startCurrentSource() {
    guard isMounted else {
      return
    }
    if let sourceValidationFailure {
      let currentGeneration = nextGeneration()
      showStatus("Opening EPUB…")
      emitState("opening", generation: currentGeneration)
      finishWithError(sourceValidationFailure, generation: currentGeneration)
      return
    }
    guard let publicationSource else {
      showStatus("Waiting for an EPUB")
      emitState("idle")
      return
    }

    let currentGeneration = nextGeneration()
    let profile = configuredTypographyProfile
    let requestedPreferences = configuredPreferences
    let requestedInitialLocation = pendingInitialLocation
    let requestedInitialLocationReason = pendingInitialLocationReason
    showStatus("Opening EPUB…")
    emitState("opening", generation: currentGeneration)

    let session = PublicationSession(
      assetRetriever: assetRetriever,
      publicationOpener: publicationOpener,
      resourceLedger: sessionResources
    )
    openingSession = session
    openTask = Task { [weak self, weak session] in
      guard let self else {
        return
      }
      guard let session else {
        return
      }

      let openedPublication: Publication
      do {
        openedPublication = try await session.open(
          source: publicationSource,
          typographyProfile: profile,
          sender: nearestViewController
        )
      } catch is CancellationError {
        return
      } catch let failure as PublicationSessionFailure {
        if openingSession === session {
          openingSession = nil
        }
        finishWithError(failure, generation: currentGeneration)
        return
      } catch {
        if openingSession === session {
          openingSession = nil
        }
        finishWithError(
          code: "PUBLICATION_OPEN_FAILED",
          phase: "open",
          message: "The EPUB publication could not be opened.",
          recoverable: true,
          generation: currentGeneration
        )
        return
      }
      guard isCurrent(currentGeneration), openingSession === session else {
        session.close()
        return
      }

      let resolvedInitialLocation: Locator?
      if let requestedInitialLocation {
        guard let located = await openedPublication.locate(requestedInitialLocation) else {
          session.close()
          if openingSession === session {
            openingSession = nil
          }
          finishWithError(
            code: "INVALID_LOCATOR",
            phase: "navigate",
            message: "The initial locator does not resolve in this publication.",
            recoverable: true,
            generation: currentGeneration
          )
          return
        }
        resolvedInitialLocation = located
      } else {
        resolvedInitialLocation = nil
      }
      guard isCurrent(currentGeneration), openingSession === session else {
        session.close()
        return
      }
      firstLocationReason = NavigationPolicy.initialLocationReason(
        hasLocator: requestedInitialLocation != nil,
        preferenceChange: requestedInitialLocationReason == .preferenceChange
      ).rawValue

      let openedNavigator: EPUBNavigatorViewController
      do {
        let configuration = EPUBNavigatorViewController.Configuration(
          preferences: readiumPreferences(
            requestedPreferences,
            fixedLayout: openedPublication.metadata.layout == .fixed,
            typographyProfile: profile
          ),
          editingActions: [.copy] + configuredSelectionActions.enumerated().map { index, action in
            EditingAction(title: action.title, action: self.selectionActionSelectors[index])
          },
          // In scrolled layout a disabled chapter swipe must not move the
          // page at all; Readium stops resource turns there, and
          // finishScrolledChapterSwipe reports the attempt. Paginated layout
          // still relies on the locator guard's rollback.
          disablePageTurnsWhileScrolling: configuredNavigationPolicy.chapterTurnGesture == "disabled",
          decorationTemplates: NativeDecorationRenderer.templates(),
          fontFamilyDeclarations: openedPublication.metadata.layout != .fixed
              && profile?.publisherStyles.injectsProfileRules == true
            ? NativeFontRegistry.declarations(for: installedFonts)
            : []
        )
        openedNavigator = try EPUBNavigatorViewController(
          publication: openedPublication,
          initialLocation: resolvedInitialLocation,
          config: configuration
        )
      } catch {
        session.close()
        if openingSession === session {
          openingSession = nil
        }
        finishWithError(
          code: "NAVIGATOR_CREATION_FAILED",
          phase: "render",
          message: "The EPUB navigator could not be created.",
          recoverable: true,
          generation: currentGeneration
        )
        return
      }
      guard isCurrent(currentGeneration) else {
        session.close()
        return
      }

      navigator = openedNavigator
      openedNavigator.delegate = self
      restoreDecorations(on: openedNavigator)
      pendingInitialLocation = nil
      pendingInitialLocationReason = nil
      attachNavigatorIfPossible(generation: currentGeneration)
    }
  }

  private func attachNavigatorIfPossible(generation expectedGeneration: Int? = nil) {
    guard
      isMounted,
      let navigator,
      let session = openingSession,
      let publication = session.publication,
      navigator.parent == nil,
      expectedGeneration.map(isCurrent) ?? true
    else {
      return
    }

    guard let parent = nearestViewController else {
      showStatus("Waiting for native host…")
      emitState("waitingForHost")
      DispatchQueue.main.async { [weak self] in
        self?.attachNavigatorIfPossible(generation: expectedGeneration)
      }
      return
    }

    parent.addChild(navigator)
    navigator.view.frame = bounds
    navigator.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    insertSubview(navigator.view, belowSubview: statusLabel)
    navigator.didMove(toParent: parent)

    activeSession = session
    openingSession = nil
    openTask = nil
    let readyGeneration = expectedGeneration ?? generation
    showStatus("Preparing publication data…")
    preparePublicationData(
      for: publication,
      navigator: navigator,
      generation: readyGeneration
    )
  }

  private var nearestViewController: UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController {
        return controller
      }
      responder = next
    }
    return nil
  }

  private func stopForUnmount() {
    guard
      isMounted || openTask != nil || navigator != nil || openingSession != nil
        || activeSession != nil
    else {
      return
    }

    if let currentLocation = navigator?.currentLocation {
      pendingInitialLocation = currentLocation
      pendingInitialLocationReason = .restored
    }
    endSelection(reason: "dismissed")
    isMounted = false
    let cancelledGeneration = invalidateCurrentGeneration()
    emitClosingIfNeeded(generation: cancelledGeneration)
    tearDownNavigator()
    showStatus("Reader unmounted")
    emitState("unmounted")
  }

  private func tearDownNavigator() {
    openTask?.cancel()
    openTask = nil
    typographyDiagnosticTask?.cancel()
    typographyDiagnosticTask = nil
    selectionActionTask?.cancel()
    selectionActionTask = nil
    selectionMonitorTask?.cancel()
    selectionMonitorTask = nil
    latestSelectionSnapshot = nil
    latestSelectionFingerprint = nil
    latestNativeSelectionFingerprint = nil
    selectionLifecycleStarted = false
    footnoteEventTask?.cancel()
    footnoteEventTask = nil
    linkEventTask?.cancel()
    linkEventTask = nil
    imageEventTask?.cancel()
    imageEventTask = nil
    progressEventTask?.cancel()
    progressEventTask = nil
    publicationDataTask?.cancel()
    publicationDataTask = nil
    navigationTask?.cancel()
    navigationTask = nil
    preferenceUpdateTask?.cancel()
    preferenceUpdateTask = nil
    gestureRollbackTask?.cancel()
    gestureRollbackTask = nil
    clearViewportResizeGuard()
    clearPaginatedDrag()
    directionalNavigationAdapter?.unbind()
    directionalNavigationAdapter = nil
    if let imageInputObserverToken, let navigator {
      navigator.removeObserver(imageInputObserverToken)
    }
    imageInputObserverToken = nil
    imageInputObserver = nil
    if let paginatedDragObserverToken, let navigator {
      navigator.removeObserver(paginatedDragObserverToken)
    }
    paginatedDragObserverToken = nil
    paginatedDragObserver = nil
    clearImageResources()
    searchCoordinator.cancelAll()
    preferenceUpdateSerial += 1
    progressReadyGeneration = nil
    initialProgressGeneration = nil
    firstLocationReason = StableReaderLocationReason.initial.rawValue
    totalPositionCount = nil
    publicationData = nil
    nativePositions = []
    publicationDataMappingDurationMilliseconds = 0
    activeNavigationCommandId = nil
    programmaticNavigationActivityIds.removeAll()
    clearProgrammaticNavigationAuthorization()
    latestStableLocation = nil
    latestPreferencesStatus = nil
    latestNavigationPolicyStatus = nil
    acceptedUserLocation = nil
    navigationUnitBoundaryConfiguration = nil
    acceptedNavigationUnitMatch = nil
    pendingUserLocationReason = StableReaderLocationReason.userScroll.rawValue
    observedDecorationGroups.removeAll()

    if let navigator {
      navigator.willMove(toParent: nil)
      navigator.view.removeFromSuperview()
      navigator.removeFromParent()
    }

    navigator = nil
    openingSession?.close()
    openingSession = nil
    activeSession?.close()
    activeSession = nil
  }

  private func finishWithError(_ error: PublicationSessionFailure, generation: Int) {
    finishWithError(
      code: error.code,
      phase: error.phase,
      message: error.message,
      recoverable: error.recoverable,
      generation: generation
    )
  }

  private func finishWithError(
    code: String,
    phase: String,
    message: String,
    recoverable: Bool,
    generation: Int
  ) {
    guard isCurrent(generation) else {
      return
    }

    let stableCode = SharedReaderErrorMapper.code(for: code).rawValue
    let stablePhase = SharedReaderErrorMapper.phase(for: phase).rawValue

    openTask = nil
    openingSession?.close()
    openingSession = nil
    activeSession?.close()
    activeSession = nil
    navigator = nil
    showStatus("Unable to open EPUB\n\(message)")
    emitState(
      "error",
      code: stableCode,
      phase: stablePhase,
      message: message,
      recoverable: recoverable,
      generation: generation
    )
  }

  private func emitClosingIfNeeded(generation: Int) {
    if openTask != nil || navigator != nil || openingSession != nil || activeSession != nil {
      emitState("closing", generation: generation)
    }
  }

  private func showStatus(_ text: String) {
    statusLabel.text = text
    statusLabel.isHidden = false
  }

  func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
    guard let epubNavigator = navigator as? EPUBNavigatorViewController else {
      return
    }
    if handleUserLocationCandidate(locator, navigator: epubNavigator) {
      return
    }
    scheduleTypographyDiagnostics(for: epubNavigator, generation: generation)
    scheduleProgress()
  }

  func navigator(
    _ navigator: any ViewportObservingNavigator,
    viewportDidChange viewport: NavigatorViewport?
  ) {
    guard navigator === self.navigator else {
      return
    }
    guard
      gestureRollbackTask == nil,
      viewportResizeTarget == nil,
      paginatedDragAnchor == nil
    else { return }
    scheduleProgress()
  }

  private func handleUserLocationCandidate(
    _ locator: Locator,
    navigator: EPUBNavigatorViewController
  ) -> Bool {
    if let target = viewportResizeTarget {
      if locatorMatchesTarget(locator, target) {
        acceptedUserLocation = locator
        updateAcceptedNavigationUnitMatch(locator)
        clearViewportResizeGuard()
        return true
      }
      clearViewportResizeGuard()
      progressEventTask?.cancel()
      progressEventTask = nil
      let expectedGeneration = generation
      gestureRollbackTask = Task { [weak self, weak navigator] in
        guard let self, let navigator else { return }
        let restored = await navigator.go(
          to: target,
          options: NavigatorGoOptions(animated: false)
        )
        guard
          !Task.isCancelled,
          expectedGeneration == generation,
          navigator === self.navigator
        else {
          return
        }
        // `go()` resolves before the paginated WebView finishes publishing all
        // visible-resource callbacks. Keep the rollback task alive as a
        // suppression window and retain the canonical target while they settle.
        acceptedUserLocation = restored ? target : (navigator.currentLocation ?? locator)
        if let acceptedUserLocation {
          updateAcceptedNavigationUnitMatch(acceptedUserLocation)
        }
        if restored {
          try? await Task.sleep(nanoseconds: Self.gestureRollbackSettlementNanoseconds)
          guard
            !Task.isCancelled,
            expectedGeneration == generation,
            navigator === self.navigator
          else {
            return
          }
        }
        gestureRollbackTask = nil
        if !restored {
          pendingUserLocationReason = StableReaderLocationReason.userPageTurn.rawValue
          scheduleProgress()
        }
      }
      return true
    }
    if gestureRollbackTask != nil { return true }
    if paginatedDragAnchor != nil {
      paginatedDragCandidate = locator
      if !paginatedDragInProgress {
        schedulePaginatedDragSettlement()
      }
      return true
    }
    guard progressReadyGeneration == generation else {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    let isAuthorizedProgrammaticTarget = isProgrammaticNavigationAuthorized(for: locator)
    guard
      !isProgrammaticNavigationInFlight,
      !isAuthorizedProgrammaticTarget,
      preferenceUpdateTask == nil
    else {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    guard let previous = acceptedUserLocation else {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    let resourceChanged = !resourcePathsMatch(previous.href, locator.href)
    let configuration = navigationUnitBoundaryConfiguration
    let previousUnitMatch = configuration.flatMap {
      NavigationUnitBoundaryPolicy.match(
        configuration: $0,
        location: navigationBoundaryLocation(previous),
        preferredUnitId: acceptedNavigationUnitMatch?.unit.id
      )
    }
    let candidateUnitMatch = configuration.flatMap {
      NavigationUnitBoundaryPolicy.match(
        configuration: $0,
        location: navigationBoundaryLocation(locator),
        preferredUnitId: previousUnitMatch?.unit.id
      )
    }
    let exactUnitChanged = previousUnitMatch?.unit.id != nil
      && candidateUnitMatch?.unit.id != nil
      && previousUnitMatch?.unit.id != candidateUnitMatch?.unit.id
    let boundariesPending = configuredNavigationUnitBoundariesRequired
      && configuration == nil
      && effectiveReaderLayout() == "paginated"
    let rejected = ReaderNavigationPolicy.rejectsUserMovement(
      policy: configuredNavigationPolicy,
      effectiveLayout: effectiveReaderLayout(),
      resourceChanged: exactUnitChanged || resourceChanged || boundariesPending
    )
    guard rejected else {
      acceptedUserLocation = locator
      acceptedNavigationUnitMatch = candidateUnitMatch
      pendingUserLocationReason = effectiveReaderLayout() == "paginated" || resourceChanged
        ? StableReaderLocationReason.userPageTurn.rawValue
        : StableReaderLocationReason.userScroll.rawValue
      return false
    }

    progressEventTask?.cancel()
    progressEventTask = nil
    let expectedGeneration = generation
    // Publication positions can be resource-granular and outrank the precise
    // resource progression during a rollback. Prefer the accepted viewport.
    let rollbackTarget = previous.copy(locations: {
      $0.position = nil
      $0.totalProgression = nil
    })
    gestureRollbackTask = Task { [weak self, weak navigator] in
      guard let self, let navigator else { return }
      let restored = await navigator.go(
        to: rollbackTarget,
        options: NavigatorGoOptions(animated: false)
      )
      guard
        !Task.isCancelled,
        expectedGeneration == generation,
        navigator === self.navigator
      else {
        return
      }
      // Readium can report both resources in a boundary spread after `go()`
      // has returned. Preserve the accepted locator and suppress those delayed
      // callbacks so they cannot start a second rollback feedback loop.
      acceptedUserLocation = restored ? previous : navigator.currentLocation
      acceptedNavigationUnitMatch = restored ? previousUnitMatch : candidateUnitMatch
      if restored {
        try? await Task.sleep(nanoseconds: Self.gestureRollbackSettlementNanoseconds)
        guard
          !Task.isCancelled,
          expectedGeneration == generation,
          navigator === self.navigator
        else {
          return
        }
      }
      gestureRollbackTask = nil
      if restored,
         exactUnitChanged,
         let previousUnitMatch,
         let candidateUnitMatch
      {
        emitNavigationUnitBoundary(
          current: previousUnitMatch,
          candidate: candidateUnitMatch,
          locator: navigator.currentLocation ?? rollbackTarget
        )
      }
      if !restored {
        pendingUserLocationReason = StableReaderLocationReason.userPageTurn.rawValue
        scheduleProgress()
      }
    }
    return true
  }

  private func emitNavigationUnitBoundary(
    current: ReaderNavigationUnitBoundaryMatch,
    candidate: ReaderNavigationUnitBoundaryMatch,
    locator: Locator
  ) {
    guard
      let configuration = navigationUnitBoundaryConfiguration,
      configuration.generation == generation,
      configuration.instanceId == instanceId,
      let sequence = stableEventProtocol.nextEvent(generation: generation),
      let locatorPayload = jsonObject(for: locator)
    else {
      return
    }
    let direction = candidate.index > current.index ? "forward" : "backward"
    let adjacentIndex = current.index + (direction == "forward" ? 1 : -1)
    let adjacent = configuration.units.indices.contains(adjacentIndex)
      ? configuration.units[adjacentIndex]
      : nil
    var payload: [String: Any] = [
      "boundary": direction == "forward" ? "end" : "start",
      "direction": direction,
      "generation": generation,
      "instanceId": instanceId,
      "kind": adjacent == nil ? "publication" : "unit",
      "locator": locatorPayload,
      "navigationUnitId": current.unit.id,
      "precision": current.precision,
      "sequence": sequence,
    ]
    if let adjacent {
      payload["adjacentNavigationUnitId"] = adjacent.id
    }
    onNavigationUnitBoundary(payload)
  }

  private func updateAcceptedNavigationUnitMatch(_ locator: Locator) {
    guard
      let configuration = navigationUnitBoundaryConfiguration,
      configuration.generation == generation,
      configuration.instanceId == instanceId
    else {
      acceptedNavigationUnitMatch = nil
      return
    }
    acceptedNavigationUnitMatch = NavigationUnitBoundaryPolicy.match(
      configuration: configuration,
      location: navigationBoundaryLocation(locator),
      preferredUnitId: acceptedNavigationUnitMatch?.unit.id
    )
  }

  func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
    let nativeCode = "NAVIGATOR_RUNTIME_FAILED"
    let nativePhase = "render"
    emitState(
      "error",
      code: SharedReaderErrorMapper.code(for: nativeCode).rawValue,
      phase: SharedReaderErrorMapper.phase(for: nativePhase).rawValue,
      message: "The EPUB navigator reported a runtime error.",
      recoverable: true
    )
  }

  private func preparePublicationData(
    for publication: Publication,
    navigator: EPUBNavigatorViewController,
    generation expectedGeneration: Int
  ) {
    publicationDataTask?.cancel()
    publicationDataTask = Task { [weak self, weak publication, weak navigator] in
      guard let self, let publication, let navigator else {
        return
      }
      let startedAt = ProcessInfo.processInfo.systemUptime
      let positions = (try? await publication.positions().get()) ?? []
      let metadata = publication.metadata
      let tableOfContents = publication.manifest.tableOfContents
      let readingOrder = publication.readingOrder
      let snapshot = await Task.detached(priority: .userInitiated) {
        PublicationDataMapper.map(
          metadata: metadata,
          tableOfContents: tableOfContents,
          readingOrder: readingOrder,
          positions: positions,
          continuousProgressAvailable: true
        )
      }.value
      guard
        !Task.isCancelled,
        isCurrent(expectedGeneration),
        publication === self.publication,
        navigator === self.navigator
      else {
        return
      }

      publicationData = snapshot
      nativePositions = positions
      publicationDataMappingDurationMilliseconds = Int(
        ((ProcessInfo.processInfo.systemUptime - startedAt) * 1000).rounded()
      )
      totalPositionCount = snapshot.positions.count
      progressReadyGeneration = expectedGeneration
      statusLabel.isHidden = true
      emitState("ready", generation: expectedGeneration)
      emitPreferencesStatus(
        preferences: configuredPreferences,
        fixedLayout: publication.metadata.layout == .fixed
      )
      configureImageActivationObserver()
      configurePaginatedDragObserver()
      configureDirectionalNavigationAdapter()
      emitNavigationPolicyStatus()
      scheduleTypographyDiagnostics(for: navigator, generation: expectedGeneration)
      emitProgress(reason: firstLocationReason)
      publicationDataTask = nil
    }
  }

  private func scheduleProgress() {
    let expectedGeneration = generation
    guard progressReadyGeneration == expectedGeneration else {
      return
    }
    guard preferenceUpdateTask == nil else {
      return
    }
    let reason = initialProgressGeneration == expectedGeneration
      ? (isProgrammaticNavigationInFlight ? "programmatic" : pendingUserLocationReason)
      : firstLocationReason
    progressEventTask?.cancel()
    progressEventTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 120_000_000)
      guard let self, !Task.isCancelled, isCurrent(expectedGeneration) else {
        return
      }
      emitProgress(reason: reason)
      progressEventTask = nil
    }
  }

  private func emitProgress(
    reason requestedReason: String,
    preferredLocator: Locator? = nil
  ) {
    guard
      let navigator,
      let publication,
      progressReadyGeneration == generation
    else {
      return
    }

    let viewport = navigator.viewport
    guard
      let locator = progressLocator(
        navigator: navigator,
        viewport: viewport,
        preferredLocator: preferredLocator
      ),
      let locatorPayload = jsonObject(for: locator)
    else {
      return
    }

    let readingOrder = publication.readingOrder
    let resourceIndex = readingOrderIndex(for: locator, in: readingOrder) ?? 0
    let totalResources = max(readingOrder.count, 1)
    let visibleResource = viewport?.resources.first {
      resourcePathsMatch(locator.href, $0.href)
    }
    let resourceProgress = clampedProgress(
      locator.locations.progression ?? visibleResource?.progression.lowerBound
    ) ?? 0
    let fallbackOverall = clampedProgress(
      (Double(resourceIndex) + resourceProgress) / Double(totalResources)
    ) ?? 0
    // Readium's viewport aggregate can briefly retain the source position after
    // a programmatic jump has settled. The locator is our canonical checkpoint,
    // so prefer its total progression and use the viewport only as a fallback.
    let overallProgress = clampedProgress(locator.locations.totalProgression)
      ?? clampedProgress(viewport?.progression.lowerBound)
      ?? fallbackOverall
    let precision: String = if viewport != nil {
      "continuous"
    } else if locator.locations.position != nil, totalPositionCount != nil {
      "position"
    } else {
      "resource"
    }
    let reason = initialProgressGeneration == generation ? requestedReason : firstLocationReason
    initialProgressGeneration = generation
    acceptedUserLocation = locator
    updateAcceptedNavigationUnitMatch(locator)
    if reason != StableReaderLocationReason.userScroll.rawValue {
      pendingUserLocationReason = StableReaderLocationReason.userScroll.rawValue
    }

    var payload: [String: Any] = [
      "chapterTurnGesture": configuredNavigationPolicy.chapterTurnGesture,
      "generation": generation,
      "instanceId": instanceId,
      "layout": publication.metadata.layout == .fixed ? "paginated" : configuredPreferences.layout,
      "locator": locatorPayload,
      "overallProgress": overallProgress,
      "platform": "ios",
      "precision": precision,
      "reason": reason,
      "resourceIndex": resourceIndex,
      "resourceProgress": resourceProgress,
      "totalResources": totalResources,
    ]
    if let position = locator.locations.position {
      payload["position"] = position
    }
    if let totalPositionCount, totalPositionCount > 0 {
      payload["totalPositions"] = totalPositionCount
    }
    if let viewport {
      var viewportPayload: [String: Any] = [
        "endOverallProgress": clampedProgress(viewport.progression.upperBound) ?? overallProgress,
        "resources": viewport.resources.map {
          [
            "endProgression": clampedProgress($0.progression.upperBound) ?? 1,
            "href": $0.href.string,
            "startProgression": clampedProgress($0.progression.lowerBound) ?? 0,
          ] as [String: Any]
        },
        "startOverallProgress": clampedProgress(viewport.progression.lowerBound)
          ?? overallProgress,
      ]
      if let positions = viewport.positions {
        viewportPayload["startPosition"] = positions.lowerBound
        viewportPayload["endPosition"] = positions.upperBound
      }
      payload["viewport"] = viewportPayload
    }

    onProgress(payload)
    emitStableLocation(
      locatorPayload: locatorPayload,
      reason: reason,
      precision: precision,
      overallProgress: overallProgress,
      position: locator.locations.position,
      totalPositions: totalPositionCount
    )
  }

  private func progressLocator(
    navigator: EPUBNavigatorViewController,
    viewport: NavigatorViewport?,
    preferredLocator: Locator?
  ) -> Locator? {
    if let preferredLocator {
      return preferredLocator
    }

    let current = navigator.currentLocation
    guard
      let accepted = acceptedUserLocation,
      let resources = viewport?.resources,
      !resources.isEmpty
    else {
      return current ?? acceptedUserLocation
    }

    let acceptedIsVisible = resources.contains {
      resourcePathsMatch(accepted.href, $0.href)
    }
    let currentIsVisible = current.map { candidate in
      resources.contains { resourcePathsMatch(candidate.href, $0.href) }
    } ?? false

    // Readium Swift can visually settle an animated resource jump before
    // `currentLocation` leaves the source resource. The delegate-accepted
    // destination is authoritative when it is the only locator represented in
    // the current viewport; otherwise retain Readium's live locator so
    // within-resource progression stays precise.
    if acceptedIsVisible, !currentIsVisible {
      return accepted
    }
    return current ?? accepted
  }

  private func emitStableLocation(
    locatorPayload: [String: Any],
    reason: String,
    precision: String,
    overallProgress: Double,
    position: Int?,
    totalPositions: Int?
  ) {
    let stableReason = StableReaderLocationReason(
      rawValue: reason == "probe" ? "programmatic" : reason
    ) ?? .programmatic
    let timestamp = Int64((ProcessInfo.processInfo.systemUptime * 1_000).rounded(.down))
    guard
      let sequence = stableEventProtocol.nextLocation(
        generation: generation,
        reason: stableReason,
        timestampMilliseconds: timestamp
      )
    else {
      return
    }
    var payload: [String: Any] = [
      "generation": generation,
      "instanceId": instanceId,
      "locator": locatorPayload,
      "overallProgress": overallProgress,
      "precision": precision,
      "reason": stableReason.rawValue,
      "sequence": sequence,
    ]
    if let position {
      payload["position"] = position
    }
    if let totalPositions, totalPositions > 0 {
      payload["totalPositions"] = totalPositions
    }
    latestStableLocation = payload
    onLocationChange(payload)
  }

  private func navigateToNextResource() {
    let expectedGeneration = generation
    navigationTask?.cancel()
    navigationTask = Task { [weak self] in
      guard
        let self,
        let navigator,
        let publication,
        let sourceLocator = navigator.currentLocation,
        let sourcePayload = jsonObject(for: sourceLocator),
        isCurrent(expectedGeneration)
      else {
        return
      }

      let readingOrder = publication.readingOrder
      let sourceIndex = readingOrderIndex(for: sourceLocator, in: readingOrder)
      let targetLink = sourceIndex.flatMap { index in
        readingOrder.indices.contains(index + 1) ? readingOrder[index + 1] : nil
      }
      let activityId = beginProgrammaticNavigationActivity()
      defer { endProgrammaticNavigationActivity(activityId) }
      let success = if let targetLink {
        await navigator.go(to: targetLink, options: NavigatorGoOptions(animated: false))
      } else {
        false
      }
      if success {
        try? await Task.sleep(nanoseconds: 180_000_000)
      }
      guard
        !Task.isCancelled,
        isCurrent(expectedGeneration),
        navigator === self.navigator,
        publication === self.publication
      else {
        return
      }

      var payload: [String: Any] = [
        "action": "next-resource",
        "fromLocator": sourcePayload,
        "generation": expectedGeneration,
        "instanceId": instanceId,
        "platform": "ios",
        "success": success,
      ]
      if let destination = navigator.currentLocation,
         let destinationPayload = jsonObject(for: destination)
      {
        payload["toLocator"] = destinationPayload
      }
      onNavigationAction(payload)
      emitProgress(reason: "programmatic")
      navigationTask = nil
    }
  }

  private func readingOrderIndex(for locator: Locator, in readingOrder: [ReadiumShared.Link]) -> Int? {
    readingOrder.firstIndex { resourcePathsMatch(locator.href, $0.url()) }
  }

  private func resourcePathsMatch(_ lhs: AnyURL, _ rhs: AnyURL) -> Bool {
    if lhs.removingFragment().isEquivalentTo(rhs.removingFragment()) {
      return true
    }
    let left = lhs.removingFragment().path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let right = rhs.removingFragment().path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return left == right || left.hasSuffix("/\(right)") || right.hasSuffix("/\(left)")
  }

  private func navigationBoundaryLocation(_ locator: Locator) -> ReaderNavigationBoundaryLocation {
    ReaderNavigationBoundaryLocation(
      href: locator.href.string,
      fragments: locator.locations.fragments,
      position: locator.locations.position,
      totalProgression: locator.locations.totalProgression
    )
  }

  private func clampedProgress(_ value: Double?) -> Double? {
    guard let value, value.isFinite else {
      return nil
    }
    return min(max(value, 0), 1)
  }

  func navigator(
    _ navigator: Navigator,
    shouldNavigateToNoteAt link: ReadiumShared.Link,
    content: String,
    referrer: String?
  ) -> Bool {
    let decision = FootnoteLinkPolicy.decideInternal(
      policy: configuredFootnotePolicy,
      href: link.href,
      semantic: true
    )
    guard decision.decision == "emit", let classification = decision.classification else {
      return true
    }
    guard
      let epubNavigator = navigator as? EPUBNavigatorViewController,
      epubNavigator === self.navigator,
      let publication,
      let sourceLocator = epubNavigator.currentLocation,
      let sourcePayload = jsonObject(for: sourceLocator)
    else {
      return true
    }

    scheduleFootnoteEvent(
      link: link,
      content: content,
      referrer: referrer,
      classification: classification,
      sourceLocator: sourceLocator,
      sourcePayload: sourcePayload,
      publication: publication,
      navigator: epubNavigator
    )

    // Classification and cancellation remain native and synchronous. JavaScript
    // receives the already-decided event and never races default navigation.
    return false
  }

  func navigator(
    _ navigator: VisualNavigator,
    shouldNavigateToLink link: ReadiumShared.Link
  ) -> Bool {
    guard
      let epubNavigator = navigator as? EPUBNavigatorViewController,
      epubNavigator === self.navigator,
      let publication,
      let sourceLocator = epubNavigator.currentLocation,
      let sourcePayload = jsonObject(for: sourceLocator)
    else {
      return true
    }

    let footnoteDecision = FootnoteLinkPolicy.decideInternal(
      policy: configuredFootnotePolicy,
      href: link.href,
      semantic: false
    )
    if footnoteDecision.decision == "emit", let classification = footnoteDecision.classification {
      scheduleFootnoteEvent(
        link: link,
        content: "",
        referrer: sourceLocator.href.string,
        classification: classification,
        sourceLocator: sourceLocator,
        sourcePayload: sourcePayload,
        publication: publication,
        navigator: epubNavigator
      )
      return false
    }

    let expectedGeneration = generation
    linkEventTask?.cancel()
    let navigationActivityId = beginProgrammaticNavigationActivity()
    linkEventTask = Task { [weak self, weak publication, weak epubNavigator] in
      guard let self, let publication, let epubNavigator else {
        return
      }
      defer { endProgrammaticNavigationActivity(navigationActivityId) }
      let targetLocator = await publication.locate(link)
      if let targetLocator {
        authorizeProgrammaticNavigation(to: targetLocator)
      }
      // Readium starts its asynchronous `go(to:)` only after this delegate
      // returns. Keep the authorized-navigation marker alive through the
      // matching location callback so disabled chapter gestures do not roll a
      // legitimate hyperlink back as touch-driven cross-resource movement.
      try? await Task.sleep(nanoseconds: 300_000_000)
      guard
        !Task.isCancelled,
        isCurrent(expectedGeneration),
        publication === self.publication,
        epubNavigator === self.navigator
      else {
        return
      }

      var payload: [String: Any] = [
        "disposition": "followed",
        "generation": expectedGeneration,
        "href": link.href,
        "instanceId": instanceId,
        "kind": "internal",
        "platform": "ios",
        "referrer": sourceLocator.href.string,
        "sourceLocator": sourcePayload,
      ]
      if let type = link.mediaType?.string { payload["contentType"] = type }
      if let targetLocator, let targetPayload = jsonObject(for: targetLocator) {
        payload["targetLocator"] = targetPayload
      }
      onLinkPress(payload)
      linkEventTask = nil
    }
    return true
  }

  func navigator(_ navigator: Navigator, presentExternalURL url: URL) {
    guard
      let epubNavigator = navigator as? EPUBNavigatorViewController,
      epubNavigator === self.navigator,
      let sourceLocator = epubNavigator.currentLocation,
      let sourcePayload = jsonObject(for: sourceLocator)
    else {
      return
    }

    let decision = FootnoteLinkPolicy.decideExternal(
      policy: configuredLinkPolicy,
      href: url.absoluteString
    )
    var payload: [String: Any] = [
      "disposition": decision.disposition,
      "generation": generation,
      "href": url.absoluteString,
      "instanceId": instanceId,
      "kind": decision.kind,
      "platform": "ios",
      "referrer": sourceLocator.href.string,
      "sourceLocator": sourcePayload,
    ]
    if let scheme = decision.scheme { payload["scheme"] = scheme }
    onLinkPress(payload)
  }

  private func scheduleFootnoteEvent(
    link: ReadiumShared.Link,
    content: String,
    referrer: String?,
    classification: String,
    sourceLocator: Locator,
    sourcePayload: [String: Any],
    publication: Publication,
    navigator: EPUBNavigatorViewController
  ) {
    let expectedGeneration = generation
    footnoteEventTask?.cancel()
    footnoteEventTask = Task { [weak self, weak publication, weak navigator] in
      guard
        let self,
        let publication,
        let navigator,
        isCurrent(expectedGeneration),
        publication === self.publication,
        navigator === self.navigator,
        !Task.isCancelled
      else {
        return
      }
      let targetLocator = await publication.locate(link)
      guard
        isCurrent(expectedGeneration),
        publication === self.publication,
        navigator === self.navigator,
        !Task.isCancelled
      else {
        return
      }
      let normalizedContent = content.isEmpty
        ? await resolvedFootnoteContent(link: link, publication: publication)
        : content
      let boundedHTML = SelectionTextBounder.bound(normalizedContent, maximumUTF16Units: 65_536)
      let boundedText = SelectionTextBounder.bound(
        plainText(fromHTML: normalizedContent),
        maximumUTF16Units: 32_768
      )
      var payload: [String: Any] = [
        "classification": classification,
        "generation": expectedGeneration,
        "href": link.href,
        "instanceId": instanceId,
        "platform": "ios",
        "sourceLocator": sourcePayload,
        "text": boundedText.text,
        "truncated": boundedHTML.truncated || boundedText.truncated,
      ]
      if !boundedHTML.text.isEmpty { payload["html"] = boundedHTML.text }
      if let fragment = link.href.split(separator: "#", maxSplits: 1).dropFirst().first,
        !fragment.isEmpty
      {
        payload["id"] = String(fragment)
      }
      if let type = link.mediaType?.string { payload["contentType"] = type }
      let boundedReferrer = SelectionTextBounder.bound(
        referrer ?? sourceLocator.href.string,
        maximumUTF16Units: 8_192
      ).text
      if !boundedReferrer.isEmpty { payload["referrer"] = boundedReferrer }
      if let language = firstHTMLAttribute("(?:xml:lang|lang)", in: normalizedContent) {
        payload["language"] = language
      }
      if let direction = firstHTMLAttribute("dir", in: normalizedContent)?.lowercased(),
        ["ltr", "rtl", "auto"].contains(direction)
      {
        payload["direction"] = direction
      }
      if let targetLocator, let targetPayload = jsonObject(for: targetLocator) {
        payload["targetLocator"] = targetPayload
      }
      onFootnotePress(payload)
      footnoteEventTask = nil
    }
  }

  private func firstHTMLAttribute(_ name: String, in html: String) -> String? {
    guard !html.isEmpty else { return nil }
    let pattern = "\\b\(name)\\s*=\\s*(['\"])([^'\"]+)\\1"
    guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    else { return nil }
    let range = NSRange(html.startIndex..., in: html)
    guard
      let match = expression.firstMatch(in: html, range: range),
      let valueRange = Range(match.range(at: 2), in: html)
    else { return nil }
    let value = String(html[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  private func resolvedFootnoteContent(
    link: ReadiumShared.Link,
    publication: Publication
  ) async -> String {
    let hrefParts = link.href.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
    guard hrefParts.count == 2, !hrefParts[1].isEmpty, let resource = publication.get(link) else {
      return ""
    }
    guard
      let data = try? await resource.read(range: 0 ..< 1_048_576).get(),
      let document = String(data: data, encoding: .utf8)
    else {
      return ""
    }
    return FootnoteLinkPolicy.targetHTML(document: document, fragment: String(hrefParts[1]))
  }

  private func plainText(fromHTML html: String) -> String {
    let wrappedHTML = "<html><body>\(html)</body></html>"
    let rendered = try? NSAttributedString(
      data: Data(wrappedHTML.utf8),
      options: [
        .documentType: NSAttributedString.DocumentType.html,
        .characterEncoding: String.Encoding.utf8.rawValue,
      ],
      documentAttributes: nil
    ).string
    let fallback = html.replacingOccurrences(
      of: "<[^>]+>",
      with: " ",
      options: .regularExpression
    )
    return (rendered ?? fallback)
      .components(separatedBy: .whitespacesAndNewlines)
      .filter { !$0.isEmpty }
      .joined(separator: " ")
  }

  func navigator(
    _ selectableNavigator: SelectableNavigator,
    shouldShowMenuForSelection selection: Selection
  ) -> Bool {
    guard let epubNavigator = selectableNavigator as? EPUBNavigatorViewController else {
      return true
    }
    beginSelectionMonitoring(selection, navigator: epubNavigator)
    return true
  }

  func navigator(
    _ selectableNavigator: SelectableNavigator,
    canPerformAction action: EditingAction,
    for selection: Selection
  ) -> Bool {
    !(selection.locator.text.highlight ?? "").isEmpty
  }

  private var selectionActionSelectors: [Selector] {
    [
      #selector(performSelectionAction0(_:)),
      #selector(performSelectionAction1(_:)),
      #selector(performSelectionAction2(_:)),
      #selector(performSelectionAction3(_:)),
      #selector(performSelectionAction4(_:)),
      #selector(performSelectionAction5(_:)),
      #selector(performSelectionAction6(_:)),
      #selector(performSelectionAction7(_:)),
    ]
  }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if let index = selectionActionSelectors.firstIndex(of: action) {
      return index < configuredSelectionActions.count && navigator?.currentSelection != nil
    }
    return super.canPerformAction(action, withSender: sender)
  }

  @objc private func performSelectionAction0(_ sender: Any?) { performSelectionAction(at: 0) }
  @objc private func performSelectionAction1(_ sender: Any?) { performSelectionAction(at: 1) }
  @objc private func performSelectionAction2(_ sender: Any?) { performSelectionAction(at: 2) }
  @objc private func performSelectionAction3(_ sender: Any?) { performSelectionAction(at: 3) }
  @objc private func performSelectionAction4(_ sender: Any?) { performSelectionAction(at: 4) }
  @objc private func performSelectionAction5(_ sender: Any?) { performSelectionAction(at: 5) }
  @objc private func performSelectionAction6(_ sender: Any?) { performSelectionAction(at: 6) }
  @objc private func performSelectionAction7(_ sender: Any?) { performSelectionAction(at: 7) }

  private func performSelectionAction(at index: Int) {
    guard configuredSelectionActions.indices.contains(index) else { return }
    scheduleSelectionAction(actionId: configuredSelectionActions[index].id)
  }

  private func scheduleSelectionAction(actionId: String) {
    let expectedGeneration = generation
    selectionActionTask?.cancel()
    selectionActionTask = Task { [weak self] in
      guard let self else { return }
      for attempt in 0 ..< 8 {
        if attempt > 0 { try? await Task.sleep(nanoseconds: 50_000_000) }
        guard isCurrent(expectedGeneration), let navigator else { return }
        guard let selection = navigator.currentSelection else { continue }
        guard let snapshot = await selectionSnapshot(
          selection,
          navigator: navigator,
          expectedGeneration: expectedGeneration
        ) else { return }
        acceptSelectionSnapshot(snapshot, nativeSelection: selection, handlesActive: true)
        guard let sequence = stableEventProtocol.nextEvent(generation: expectedGeneration) else {
          return
        }
        onSelectionAction([
          "actionId": actionId,
          "generation": expectedGeneration,
          "handlesActive": navigator.currentSelection != nil,
          "instanceId": instanceId,
          "platform": "ios",
          "selection": snapshot,
          "sequence": sequence,
        ])
        selectionActionTask = nil
        return
      }
      selectionActionTask = nil
    }
  }

  private func beginSelectionMonitoring(
    _ initialSelection: Selection,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) {
    let expectedGeneration = generation
    selectionMonitorTask?.cancel()
    selectionMonitorTask = Task { [weak self, weak expectedNavigator] in
      guard let self, let expectedNavigator else { return }
      var selection: Selection? = initialSelection
      while !Task.isCancelled {
        guard
          isCurrent(expectedGeneration),
          navigator === expectedNavigator
        else { return }
        guard let currentSelection = selection ?? expectedNavigator.currentSelection else {
          endSelection(reason: "dismissed")
          return
        }
        let nativeFingerprint = nativeSelectionFingerprint(currentSelection)
        if nativeFingerprint != latestNativeSelectionFingerprint,
           let snapshot = await selectionSnapshot(
             currentSelection,
             navigator: expectedNavigator,
             expectedGeneration: expectedGeneration
           )
        {
          acceptSelectionSnapshot(snapshot, nativeSelection: currentSelection, handlesActive: true)
        }
        selection = nil
        try? await Task.sleep(nanoseconds: 100_000_000)
      }
    }
  }

  private func selectionSnapshot(
    _ selection: Selection,
    navigator expectedNavigator: EPUBNavigatorViewController,
    expectedGeneration: Int
  ) async -> [String: Any]? {
    guard
      isCurrent(expectedGeneration),
      navigator === expectedNavigator,
      let publication,
      var locator = jsonObject(for: selection.locator)
    else { return nil }

    let selectedText = selection.locator.text.highlight ?? ""
    let copyAllowed = await publication.rights.canCopy(text: selectedText)
    guard isCurrent(expectedGeneration), navigator === expectedNavigator else { return nil }

    let boundedText = SelectionTextBounder.bound(
      selectedText,
      maximumUTF16Units: SelectionActionPolicy.maximumSelectionTextUTF16Units
    )
    var truncated = boundedText.truncated
    if copyAllowed {
      var locatorText = locator["text"] as? [String: Any] ?? [:]
      let before = SelectionTextBounder.boundEnd(
        selection.locator.text.before ?? "",
        maximumUTF16Units: SelectionActionPolicy.maximumSelectionContextUTF16Units
      )
      let after = SelectionTextBounder.bound(
        selection.locator.text.after ?? "",
        maximumUTF16Units: SelectionActionPolicy.maximumSelectionContextUTF16Units
      )
      locatorText["highlight"] = boundedText.text
      if !before.text.isEmpty { locatorText["before"] = before.text }
      else { locatorText.removeValue(forKey: "before") }
      if !after.text.isEmpty { locatorText["after"] = after.text }
      else { locatorText.removeValue(forKey: "after") }
      locator["text"] = locatorText
      truncated = truncated || before.truncated || after.truncated
    } else {
      locator.removeValue(forKey: "text")
    }

    var snapshot: [String: Any] = [
      "copyAllowed": copyAllowed,
      "direction": SelectionActionPolicy.textDirection(selectedText),
      "locator": locator,
      "text": copyAllowed ? boundedText.text : "",
      "truncated": truncated,
    ]
    if let navigationUnitId = acceptedNavigationUnitMatch?.unit.id {
      snapshot["navigationUnitId"] = navigationUnitId
    }
    if let geometry = selectionGeometry(selection, navigator: expectedNavigator) {
      snapshot["geometry"] = geometry
    }
    return snapshot
  }

  private func selectionGeometry(
    _ selection: Selection,
    navigator expectedNavigator: EPUBNavigatorViewController
  ) -> [String: Any]? {
    guard
      let nativeRect = selection.frame,
      nativeRect.isFinite,
      let window,
      bounds.width > 0,
      bounds.height > 0
    else { return nil }
    let viewRect = expectedNavigator.view.convert(nativeRect, to: self)
    let windowRect = expectedNavigator.view.convert(nativeRect, to: window)
    guard viewRect.isFinite, windowRect.isFinite, bounds.isFinite else { return nil }
    let intersection = viewRect.intersection(bounds)
    let visibleViewRect: CGRect
    if intersection.isNull || !intersection.isFinite {
      visibleViewRect = CGRect(
        x: min(max(viewRect.minX, bounds.minX), bounds.maxX),
        y: min(max(viewRect.minY, bounds.minY), bounds.maxY),
        width: 0,
        height: 0
      )
    } else {
      visibleViewRect = intersection
    }
    let visibleWindowRect = convert(visibleViewRect, to: window)
    guard visibleWindowRect.isFinite else { return nil }
    return [
      "coordinateSpace": "reader-view-and-window-v1",
      "viewRect": viewRect.eventPayload,
      "visibleViewRect": visibleViewRect.eventPayload,
      "viewport": ["height": bounds.height, "width": bounds.width],
      "windowRect": windowRect.eventPayload,
      "visibleWindowRect": visibleWindowRect.eventPayload,
    ]
  }

  private func acceptSelectionSnapshot(
    _ snapshot: [String: Any],
    nativeSelection: Selection,
    handlesActive: Bool
  ) {
    guard let fingerprint = jsonFingerprint(snapshot) else { return }
    latestNativeSelectionFingerprint = nativeSelectionFingerprint(nativeSelection)
    guard fingerprint != latestSelectionFingerprint else { return }
    let reason = selectionLifecycleStarted ? "changed" : "started"
    selectionLifecycleStarted = true
    latestSelectionSnapshot = snapshot
    latestSelectionFingerprint = fingerprint
    guard let sequence = stableEventProtocol.nextEvent(generation: generation) else { return }
    onSelectionChange([
      "generation": generation,
      "handlesActive": handlesActive,
      "instanceId": instanceId,
      "platform": "ios",
      "reason": reason,
      "selection": snapshot,
      "sequence": sequence,
    ])
  }

  private func endSelection(reason: String) {
    selectionActionTask?.cancel()
    selectionActionTask = nil
    selectionMonitorTask?.cancel()
    selectionMonitorTask = nil
    latestNativeSelectionFingerprint = nil
    latestSelectionFingerprint = nil
    latestSelectionSnapshot = nil
    guard selectionLifecycleStarted else { return }
    selectionLifecycleStarted = false
    guard let sequence = stableEventProtocol.nextEvent(generation: generation) else { return }
    onSelectionChange([
      "generation": generation,
      "handlesActive": false,
      "instanceId": instanceId,
      "platform": "ios",
      "reason": reason,
      "selection": NSNull(),
      "sequence": sequence,
    ])
  }

  private func nativeSelectionFingerprint(_ selection: Selection) -> String? {
    var value: [String: Any] = ["locator": jsonObject(for: selection.locator) ?? [:]]
    if let frame = selection.frame { value["frame"] = frame.eventPayload }
    return jsonFingerprint(value)
  }

  private func jsonFingerprint(_ value: Any) -> String? {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    else { return nil }
    return String(decoding: data, as: UTF8.self)
  }

  private func jsonObject(for locator: Locator) -> [String: Any]? {
    guard
      let data = try? locator.jsonData(),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    return object
  }

  private func applyPreferences(previous: ResolvedReaderPreferences) {
    guard
      currentReaderState == .ready,
      let navigator,
      let publication
    else {
      return
    }
    let next = configuredPreferences
    let fixedLayout = publication.metadata.layout == .fixed
    emitPreferencesStatus(preferences: next, fixedLayout: fixedLayout)
    guard !appliedPreferencesEqual(previous, next, fixedLayout: fixedLayout) else {
      return
    }

    preferenceUpdateTask?.cancel()
    preferenceUpdateSerial += 1
    let updateSerial = preferenceUpdateSerial
    let expectedGeneration = generation
    let profile = configuredTypographyProfile
    preferenceUpdateTask = Task { [weak self, weak navigator, weak publication] in
      guard let self, let navigator, let publication else { return }
      defer {
        if updateSerial == preferenceUpdateSerial {
          preferenceUpdateTask = nil
        }
      }
      for _ in 0 ..< 40 where activeNavigationCommandId != nil {
        do {
          try await Task.sleep(nanoseconds: 50_000_000)
        } catch {
          return
        }
      }
      guard
        !Task.isCancelled,
        updateSerial == preferenceUpdateSerial,
        activeNavigationCommandId == nil,
        expectedGeneration == generation,
        navigator === self.navigator,
        publication === self.publication,
        currentReaderState == .ready
      else {
        return
      }

      let anchor = navigator.currentLocation
      navigator.submitPreferences(
        readiumPreferences(next, fixedLayout: fixedLayout, typographyProfile: profile)
      )
      do {
        try await Task.sleep(nanoseconds: 250_000_000)
      } catch {
        return
      }
      guard
        updateSerial == preferenceUpdateSerial,
        expectedGeneration == generation,
        navigator === self.navigator,
        publication === self.publication,
        currentReaderState == .ready
      else {
        return
      }
      if let anchor {
        _ = await navigator.go(
          to: anchor,
          options: NavigatorGoOptions(animated: false)
        )
      }
      do {
        try await Task.sleep(nanoseconds: 120_000_000)
      } catch {
        return
      }
      guard
        updateSerial == preferenceUpdateSerial,
        expectedGeneration == generation,
        navigator === self.navigator,
        publication === self.publication,
        currentReaderState == .ready
      else {
        return
      }
      emitNavigationPolicyStatus()
      emitProgress(reason: StableReaderLocationReason.preferenceChange.rawValue)
    }
  }

  private func effectiveReaderLayout() -> String {
    if publication?.metadata.layout == .fixed {
      return "paginated"
    }
    return navigator?.presentation.scroll == true ? "scrolled" : "paginated"
  }

  private func effectiveReadingProgression() -> String {
    let value = navigator?.presentation.readingProgression.rawValue ?? "ltr"
    return value == "rtl" ? "rtl" : "ltr"
  }

  private func applyNavigationPolicy(previous: ResolvedReaderNavigationPolicy) {
    guard currentReaderState == .ready else { return }
    if ReaderNavigationPolicy.requiresNavigatorRecreation(
      previous: previous,
      next: configuredNavigationPolicy
    ) {
      if let currentLocation = navigator?.currentLocation {
        pendingInitialLocation = currentLocation
        pendingInitialLocationReason = .restored
      }
      navigationPolicyApplication = "navigator-recreation"
      restartSession()
      return
    }
    navigationPolicyApplication = "live"
    configureDirectionalNavigationAdapter()
    emitNavigationPolicyStatus()
  }

  private func configureDirectionalNavigationAdapter() {
    directionalNavigationAdapter?.unbind()
    directionalNavigationAdapter = nil
    guard let navigator else { return }
    let acceptsInput = !configuredNavigationPolicy.inputSuppressed
    let pointerPolicy = DirectionalNavigationAdapter.PointerPolicy(
      types: acceptsInput && configuredNavigationPolicy.edgeTapNavigation
        ? [.touch, .mouse]
        : [],
      edges: .horizontal,
      ignoreWhileScrolling: false
    )
    let keyboardPolicy = DirectionalNavigationAdapter.KeyboardPolicy(
      handleArrowKeys: acceptsInput && configuredNavigationPolicy.hardwareKeyNavigation,
      handleSpaceKey: acceptsInput && configuredNavigationPolicy.hardwareKeyNavigation
    )
    let adapter = DirectionalNavigationAdapter(
      pointerPolicy: pointerPolicy,
      keyboardPolicy: keyboardPolicy,
      animatedTransition: configuredNavigationPolicy.animatedTransitions,
      onNavigation: { [weak self] in
        self?.pendingUserLocationReason = StableReaderLocationReason.userPageTurn.rawValue
      }
    )
    adapter.bind(to: navigator)
    directionalNavigationAdapter = adapter
  }

  private func emitNavigationPolicyStatus() {
    guard navigator != nil, publication != nil else { return }
    let boundaryGranularity: String
    let boundaryPrecision: String
    let boundaryWarnings: [String]
    if let configuration = navigationUnitBoundaryConfiguration,
       configuration.generation == generation,
       configuration.instanceId == instanceId
    {
      boundaryGranularity = "navigation-unit"
      boundaryPrecision = configuration.precision
      boundaryWarnings = []
    } else if configuredNavigationUnitBoundariesRequired {
      boundaryGranularity = "reading-order-resource"
      boundaryPrecision = "pending"
      boundaryWarnings = ["navigation-unit-boundaries-loading"]
    } else {
      boundaryGranularity = "reading-order-resource"
      boundaryPrecision = "resource"
      boundaryWarnings = ["chapter-boundaries-use-reading-order-resources"]
    }
    let payload = ReaderNavigationPolicy.statusPayload(
      policy: configuredNavigationPolicy,
      application: navigationPolicyApplication,
      boundaryGranularity: boundaryGranularity,
      boundaryPrecision: boundaryPrecision,
      boundaryWarnings: boundaryWarnings,
      effectiveLayout: effectiveReaderLayout(),
      readingProgression: effectiveReadingProgression(),
      instanceId: instanceId,
      generation: generation
    )
    latestNavigationPolicyStatus = payload
    onNavigationPolicyChange(payload)
  }

  private func emitPreferencesStatus(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Bool
  ) {
    let payload = ReaderPreferencesPolicy.statusPayload(
      preferences: preferences,
      fixedLayout: fixedLayout,
      instanceId: instanceId,
      generation: generation
    )
    latestPreferencesStatus = payload
    onPreferencesChange(payload)
  }

  private func appliedPreferencesEqual(
    _ lhs: ResolvedReaderPreferences,
    _ rhs: ResolvedReaderPreferences,
    fixedLayout: Bool
  ) -> Bool {
    let leftPolicy = ReaderPreferencesPolicy.resolve(lhs, fixedLayout: fixedLayout)
    let rightPolicy = ReaderPreferencesPolicy.resolve(rhs, fixedLayout: fixedLayout)
    guard leftPolicy.appliedNames == rightPolicy.appliedNames else { return false }
    return NSDictionary(dictionary: leftPolicy.appliedObject(from: lhs)).isEqual(
      to: rightPolicy.appliedObject(from: rhs)
    )
  }

  private func readiumPreferences(
    _ preferences: ResolvedReaderPreferences,
    fixedLayout: Bool,
    typographyProfile: ResolvedTypographyProfile?
  ) -> EPUBPreferences {
    let readingProgression = preferences.readingProgression == "auto"
      ? nil
      : ReadiumNavigator.ReadingProgression(rawValue: preferences.readingProgression)
    if fixedLayout {
      return EPUBPreferences(
        readingProgression: readingProgression,
        spread: ReadiumNavigator.Spread(rawValue: preferences.spread)
      )
    }
    let publisherStyles = typographyProfile?.publisherStyles.publisherStyles
      ?? preferences.publisherStyles
    return EPUBPreferences(
      fontSize: preferences.fontSize,
      lineHeight: publisherStyles ? nil : preferences.lineHeight,
      pageMargins: preferences.pageMargins,
      publisherStyles: publisherStyles,
      readingProgression: readingProgression,
      scroll: preferences.layout == "scrolled",
      textAlign: publisherStyles || preferences.textAlignment == "auto"
        ? nil
        : ReadiumNavigator.TextAlignment(rawValue: preferences.textAlignment),
      theme: ReadiumNavigator.Theme(rawValue: preferences.theme)
    )
  }

  func getCurrentLocationCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    return [
      "ok": true,
      "value": latestStableLocation ?? NSNull(),
    ]
  }

  func getCurrentSelectionCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    return ["ok": true, "value": latestSelectionSnapshot ?? NSNull()]
  }

  func getPublicationCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard let publicationData else {
      return publicationDataUnavailableResult()
    }
    return [
      "ok": true,
      "value": publicationData.publicationInfoValue(
        instanceId: instanceId,
        generation: generation,
        mappingDurationMilliseconds: publicationDataMappingDurationMilliseconds
      ),
    ]
  }

  func getPositionsCommand(offset: Int, limit: Int) -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard let publicationData else {
      return publicationDataUnavailableResult()
    }
    return [
      "ok": true,
      "value": publicationData.positionsPageValue(
        instanceId: instanceId,
        generation: generation,
        requestedOffset: offset,
        requestedLimit: limit
      ),
    ]
  }

  func getPreferencesCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard let latestPreferencesStatus else {
      return publicationDataUnavailableResult()
    }
    return ["ok": true, "value": latestPreferencesStatus]
  }

  func getNavigationPolicyCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard let latestNavigationPolicyStatus else {
      return publicationDataUnavailableResult()
    }
    return ["ok": true, "value": latestNavigationPolicyStatus]
  }

  func setNavigationUnitBoundariesCommand(configurationJson: String) -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard configuredNavigationUnitBoundariesRequired, let navigator else {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "Navigation-unit boundaries are not configured for this reader."
      )
    }
    do {
      let configuration = try ReaderNavigationUnitBoundaryConfiguration(
        jsonString: configurationJson
      )
      guard configuration.generation == generation, configuration.instanceId == instanceId else {
        return navigationGenerationChangedResult()
      }
      navigationUnitBoundaryConfiguration = configuration
      acceptedNavigationUnitMatch = navigator.currentLocation.flatMap {
        NavigationUnitBoundaryPolicy.match(
          configuration: configuration,
          location: navigationBoundaryLocation($0)
        )
      }
      emitNavigationPolicyStatus()
      return ["ok": true, "value": true]
    } catch {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "The navigation-unit boundary configuration is invalid."
      )
    }
  }

  func getDiagnosticsCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard let publicationData, let latestPreferencesStatus else {
      return publicationDataUnavailableResult()
    }
    let value = ReaderDiagnosticsPolicy.payload(
      platform: "ios",
      sdkVersion: NativeDependencyVersions.nativeEpubKitVersion,
      toolkitName: "readium-swift",
      toolkitVersion: NativeDependencyVersions.readiumSwiftIntegrationVersion,
      toolkitRevision: NativeDependencyVersions.readiumSwiftRevision,
      generation: generation,
      publication: publicationData.diagnosticsInput(
        mappingDurationMilliseconds: publicationDataMappingDurationMilliseconds
      ),
      fonts: NativeFontRegistry.diagnostics(fonts: installedFonts),
      preferencesStatus: latestPreferencesStatus
    )
    return ["ok": true, "value": value]
  }

  func startSearchCommand(query: String, optionsJson: String) async -> [String: Any] {
    if let error = commandErrorResult() { return error }
    guard let publication else { return publicationDataUnavailableResult() }
    let request: ResolvedReaderSearchRequest
    do {
      request = try ReaderSearchPolicy.resolve(query: query, optionsJson: optionsJson)
    } catch {
      return searchErrorResult("The search request is invalid.")
    }
    let expectedGeneration = generation
    do {
      let snapshot = try await searchCoordinator.start(
        publication: publication,
        generation: expectedGeneration,
        instanceId: instanceId,
        request: request
      )
      guard isCurrent(expectedGeneration), publication === self.publication else {
        searchCoordinator.cancel(sessionId: snapshot.id)
        return searchErrorResult("The search was cancelled because the reader changed.")
      }
      return [
        "ok": true,
        "value": [
          "decorationGroups": ReaderSearchPolicy.decorationGroups,
          "generation": snapshot.generation,
          "id": snapshot.id,
          "instanceId": snapshot.instanceId,
          "nextCursor": snapshot.nextCursor,
          "options": snapshot.options.jsonObject,
          "query": snapshot.query,
        ],
      ]
    } catch let error as ReaderSearchCoordinatorError {
      return searchCoordinatorErrorResult(error)
    } catch {
      return searchErrorResult("The publication search could not be started.")
    }
  }

  func getSearchPageCommand(sessionId: String, cursor: String) async -> [String: Any] {
    if let error = commandErrorResult() { return error }
    do {
      _ = try ReaderSearchPolicy.validateSessionId(sessionId)
      _ = try ReaderSearchPolicy.validateCursor(cursor, allowInitialEmpty: true)
    } catch {
      return searchErrorResult("The search session or page cursor is invalid.")
    }
    let expectedGeneration = generation
    do {
      let page = try await searchCoordinator.page(sessionId: sessionId, cursor: cursor)
      guard isCurrent(expectedGeneration), page.generation == generation else {
        return searchErrorResult("The search was cancelled because the reader changed.")
      }
      let results = page.results.compactMap(searchResultValue)
      guard results.count == page.results.count else {
        return searchErrorResult("A search result could not be normalized safely.")
      }
      var value: [String: Any] = [
        "complete": page.complete,
        "cursor": page.cursor,
        "generation": page.generation,
        "instanceId": page.instanceId,
        "loadedResultCount": page.loadedResultCount,
        "results": results,
        "sessionId": page.sessionId,
        "truncated": page.truncated,
      ]
      if let nextCursor = page.nextCursor { value["nextCursor"] = nextCursor }
      return ["ok": true, "value": value]
    } catch let error as ReaderSearchCoordinatorError {
      return searchCoordinatorErrorResult(error)
    } catch {
      return searchErrorResult("The next search page could not be loaded.")
    }
  }

  func cancelSearchCommand(sessionId: String) -> [String: Any] {
    if let error = commandErrorResult() { return error }
    guard (try? ReaderSearchPolicy.validateSessionId(sessionId)) != nil else {
      return searchErrorResult("The search session is invalid.")
    }
    searchCoordinator.cancel(sessionId: sessionId)
    return ["ok": true]
  }

  private func searchResultValue(_ result: ReaderSearchIndexedLocator) -> [String: Any]? {
    let locator = result.locator
    let excerpt = ReaderSearchPolicy.excerpt(
      before: locator.text.before ?? "",
      highlight: locator.text.highlight ?? "",
      after: locator.text.after ?? ""
    )
    guard var locatorValue = jsonObject(for: locator) else { return nil }
    var text: [String: Any] = [:]
    if !excerpt.before.isEmpty { text["before"] = excerpt.before }
    if !excerpt.highlight.isEmpty { text["highlight"] = excerpt.highlight }
    if !excerpt.after.isEmpty { text["after"] = excerpt.after }
    if text.isEmpty { locatorValue.removeValue(forKey: "text") }
    else { locatorValue["text"] = text }

    var value: [String: Any] = [
      "excerpt": excerpt.jsonObject,
      "id": "search-result:\(result.index)",
      "index": result.index,
      "locator": locatorValue,
    ]
    if let title = ReaderSearchPolicy.resourceTitle(locator.title) {
      value["resourceTitle"] = title
    }
    if
      let configuration = navigationUnitBoundaryConfiguration,
      configuration.generation == generation,
      configuration.instanceId == instanceId,
      let match = NavigationUnitBoundaryPolicy.match(
        configuration: configuration,
        location: navigationBoundaryLocation(locator)
      )
    {
      value["navigationUnit"] = [
        "id": match.unit.id,
        "index": match.index,
        "precision": match.precision,
      ]
    }
    return value
  }

  func resolveImageSourceCommand(handle: String, use: String) async -> [String: Any] {
    if let error = commandErrorResult() { return error }
    guard
      let imageUse = ReaderImageUse(rawValue: use),
      ReaderImagePolicy.allows(imageUse, policy: configuredImagePolicy)
    else {
      return imageResourceErrorResult(
        code: "SOURCE_PERMISSION_DENIED",
        message: "The requested image use is not allowed by the current image policy."
      )
    }
    guard
      (try? ReaderImagePolicy.validateSourceHandle(handle)) != nil,
      let source = imageSources[handle],
      source.generation == generation,
      let publication
    else {
      return imageResourceErrorResult(
        code: "RESOURCE_LOAD_FAILED",
        message: "The image source handle is invalid or no longer belongs to this reader generation."
      )
    }
    guard resolvedImageFiles.count < Self.maximumResolvedImageFiles else {
      return imageResourceErrorResult(
        code: "RESOURCE_LOAD_FAILED",
        message: "Too many resolved image files are active; release an existing image source first."
      )
    }

    let expectedGeneration = generation
    let data: Data
    switch source.payload {
    case let .inlineSVG(value):
      data = value
    case let .publicationResource(link):
      guard let resource = publication.get(link) else {
        return imageResourceErrorResult(
          code: "RESOURCE_LOAD_FAILED",
          message: "The image resource is no longer available in this publication."
        )
      }
      defer { resource.close() }
      if
        let estimated = try? await resource.estimatedLength().get(),
        estimated > UInt64(Self.maximumResolvedImageBytes)
      {
        return imageResourceErrorResult(
          code: "RESOURCE_LOAD_FAILED",
          message: "The image resource exceeds the supported size limit."
        )
      }
      guard
        let value = try? await resource.read(
          range: 0 ..< UInt64(Self.maximumResolvedImageBytes + 1)
        ).get(),
        value.count <= Self.maximumResolvedImageBytes
      else {
        return imageResourceErrorResult(
          code: "RESOURCE_LOAD_FAILED",
          message: "The image resource could not be read within the supported size limit."
        )
      }
      data = value
    }
    guard isCurrent(expectedGeneration), imageSources[handle]?.generation == expectedGeneration else {
      return imageResourceErrorResult(
        code: "RESOURCE_LOAD_FAILED",
        message: "The reader generation changed while resolving the image resource."
      )
    }

    do {
      try FileManager.default.createDirectory(
        at: imageResourceDirectory,
        withIntermediateDirectories: true
      )
      let identifier = UUID().uuidString
      let url = imageResourceDirectory.appendingPathComponent(
        "\(identifier).\(imageFileExtension(contentType: source.contentType))"
      )
      try data.write(to: url, options: [.atomic])
      resolvedImageFiles[identifier] = url
      return [
        "ok": true,
        "value": [
          "byteLength": data.count,
          "contentType": source.contentType,
          "id": identifier,
          "uri": url.absoluteString,
        ],
      ]
    } catch {
      return imageResourceErrorResult(
        code: "RESOURCE_LOAD_FAILED",
        message: "The resolved image resource could not be materialized."
      )
    }
  }

  func releaseImageSourceCommand(id: String) -> [String: Any] {
    if let url = resolvedImageFiles.removeValue(forKey: id) {
      try? FileManager.default.removeItem(at: url)
    }
    return ["ok": true, "value": true]
  }

  private func imageFileExtension(contentType: String) -> String {
    switch contentType.lowercased() {
    case "image/gif": "gif"
    case "image/jpeg": "jpg"
    case "image/png": "png"
    case "image/svg+xml": "svg"
    case "image/webp": "webp"
    default: "img"
    }
  }

  private func imageResourceErrorResult(code: String, message: String) -> [String: Any] {
    [
      "error": [
        "code": code,
        "message": message,
        "phase": "resource",
        "recoverable": true,
      ],
      "ok": false,
    ]
  }

  private func searchCoordinatorErrorResult(_ error: ReaderSearchCoordinatorError) -> [String: Any] {
    switch error {
    case .cancelled:
      searchErrorResult("The search session was cancelled or replaced.")
    case .unsupported:
      searchErrorResult("This publication does not support text search.")
    case .invalidCursor:
      searchErrorResult("The search page cursor is invalid or has already been consumed.")
    case .invalidSession:
      searchErrorResult("The search session is no longer active.")
    case .pageInFlight:
      searchErrorResult("A search page is already being loaded for this session.")
    case .failed:
      searchErrorResult("The publication search failed while reading its content.")
    }
  }

  private func searchErrorResult(_ message: String) -> [String: Any] {
    [
      "error": [
        "code": "SEARCH_FAILED",
        "message": message,
        "phase": "search",
        "recoverable": true,
      ],
      "ok": false,
    ]
  }

  func clearSelectionCommand() -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    endSelection(reason: "cleared")
    navigator?.clearSelection()
    return ["ok": true]
  }

  func setDecorationsCommand(group: String, decorationsJson: String) -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    do {
      let input = try JSONSerialization.jsonObject(with: Data(decorationsJson.utf8))
      let resolved = try DecorationPolicy.resolveDecorations(group: group, values: input)
      try commitDecorationGroup(resolved.decorations, group: resolved.group)
      return ["ok": true, "value": true]
    } catch {
      return decorationErrorResult("The decoration group state is invalid.")
    }
  }

  func updateDecorationsCommand(group: String, changesJson: String) -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    do {
      let input = try JSONSerialization.jsonObject(with: Data(changesJson.utf8))
      let resolved = try DecorationPolicy.resolveChanges(group: group, values: input)
      let next = try DecorationPolicy.applyChanges(
        current: decorationGroups[resolved.group] ?? [],
        changes: resolved.changes
      )
      try commitDecorationGroup(next, group: resolved.group)
      return ["ok": true, "value": true]
    } catch {
      return decorationErrorResult("The decoration delta is invalid.")
    }
  }

  private func commitDecorationGroup(
    _ records: [ResolvedNativeDecoration],
    group: String
  ) throws {
    guard let navigator else {
      throw DecorationPolicyError(path: "$/reader", reason: "is not ready")
    }
    if
      !records.isEmpty,
      decorationGroups[group] == nil,
      decorationGroups.count >= DecorationPolicy.maximumGroups
    {
      throw DecorationPolicyError(
        path: "$/group",
        reason: "would exceed \(DecorationPolicy.maximumGroups) active groups"
      )
    }
    let decorations = try records.map(NativeDecorationRenderer.readiumDecoration)
    if records.isEmpty {
      decorationGroups.removeValue(forKey: group)
    } else {
      decorationGroups[group] = records
      observeDecorationInteractions(in: group, on: navigator)
    }
    navigator.apply(decorations: decorations, in: group)
  }

  func goToLocatorCommand(locatorJson: String, animated: Bool) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    let locator: Locator
    do {
      let value = try JSONDecoder().decode(
        SharedJSONValue.self,
        from: Data(locatorJson.utf8)
      )
      _ = try SharedLocatorRecord(validating: value)
      locator = try Locator(jsonData: JSONEncoder().encode(value))
    } catch {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "The locator record is invalid."
      )
    }
    return await performNavigationCommand(animated: animated) { _, publication in
      guard let target = await publication.locate(locator) else {
        return .invalidTarget("The locator does not resolve in this publication.")
      }
      return .target(target)
    }
  }

  func goToLinkCommand(href: String, animated: Bool) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    let trimmedHREF = href.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedHREF.isEmpty else {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "The publication link href is empty."
      )
    }
    return await performNavigationCommand(animated: animated) { _, publication in
      guard let link = self.publicationLink(withHREF: trimmedHREF, in: publication) else {
        return .invalidTarget("The publication link does not resolve in this publication.")
      }
      return .link(link)
    }
  }

  func goToProgressionCommand(_ progression: Double, animated: Bool) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard NavigationPolicy.progressionIsValid(progression) else {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "Publication progression must be within 0...1."
      )
    }
    return await performNavigationCommand(animated: animated) { _, publication in
      guard let target = await publication.locate(progression: progression) else {
        return .invalidTarget("The publication progression could not be located.")
      }
      return .target(target)
    }
  }

  func goToPositionCommand(_ position: Int, animated: Bool) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard NavigationPolicy.positionIsValid(position), position <= nativePositions.count else {
      return navigationErrorResult(
        code: "INVALID_LOCATOR",
        message: "The publication position is outside the available positions snapshot."
      )
    }
    let target = nativePositions.first { $0.locations.position == position }
      ?? nativePositions[position - 1]
    return await performNavigationCommand(animated: animated) { _, _ in .target(target) }
  }

  func goForwardCommand(animated: Bool) async -> [String: Any] {
    await performLogicalNavigationCommand(animated: animated, forward: true)
  }

  func goBackwardCommand(animated: Bool) async -> [String: Any] {
    await performLogicalNavigationCommand(animated: animated, forward: false)
  }

  private enum NavigationDestination {
    case invalidTarget(String)
    case link(ReadiumShared.Link)
    case target(Locator)
  }

  private func performNavigationCommand(
    animated: Bool,
    resolve: (EPUBNavigatorViewController, Publication) async -> NavigationDestination
  ) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard activeNavigationCommandId == nil, preferenceUpdateTask == nil else {
      return navigationErrorResult(
        code: "NAVIGATION_FAILED",
        message: "Another navigation or preference update is already in progress."
      )
    }
    guard let navigator, let publication else {
      return publicationDataUnavailableResult()
    }
    let expectedGeneration = generation
    let commandId = beginProgrammaticNavigationActivity()
    activeNavigationCommandId = commandId
    defer {
      if activeNavigationCommandId == commandId {
        activeNavigationCommandId = nil
      }
      endProgrammaticNavigationActivity(commandId)
    }

    let destination = await resolve(navigator, publication)
    guard
      expectedGeneration == generation,
      navigator === self.navigator,
      publication === self.publication,
      currentReaderState == .ready
    else {
      return navigationGenerationChangedResult()
    }

    let success: Bool
    var preferredLocator: Locator?
    switch destination {
    case let .invalidTarget(message):
      return navigationErrorResult(code: "INVALID_LOCATOR", message: message)
    case let .link(link):
      if let target = await publication.locate(link) {
        authorizeProgrammaticNavigation(to: target)
        preferredLocator = target
      }
      success = await navigator.go(
        to: link,
        options: NavigatorGoOptions(animated: animated)
      )
    case let .target(locator):
      authorizeProgrammaticNavigation(to: locator)
      preferredLocator = locator
      success = await navigator.go(
        to: locator,
        options: NavigatorGoOptions(animated: animated)
      )
    }
    if success {
      // Readium resolves `go` before its delegate always receives the matching
      // location callback. Keep the programmatic-origin guard alive through
      // that delivery so a disabled user gesture policy cannot roll back an
      // explicit API navigation as though it came from touch input.
      try? await Task.sleep(nanoseconds: 180_000_000)
    }
    guard
      expectedGeneration == generation,
      navigator === self.navigator,
      publication === self.publication,
      currentReaderState == .ready
    else {
      return navigationGenerationChangedResult()
    }
    guard case .success(true) = NavigationPolicy.outcome(command: .jump, moved: success) else {
      clearProgrammaticNavigationAuthorization()
      return navigationErrorResult(
        code: "NAVIGATION_FAILED",
        message: "The native navigator could not move to the requested location."
      )
    }
    if let preferredLocator {
      acceptedUserLocation = preferredLocator
      updateAcceptedNavigationUnitMatch(preferredLocator)
    }
    emitProgress(reason: "programmatic", preferredLocator: preferredLocator)
    return ["ok": true, "value": true]
  }

  private func performLogicalNavigationCommand(
    animated: Bool,
    forward: Bool
  ) async -> [String: Any] {
    if let error = commandErrorResult() {
      return error
    }
    guard activeNavigationCommandId == nil, preferenceUpdateTask == nil else {
      return navigationErrorResult(
        code: "NAVIGATION_FAILED",
        message: "Another navigation or preference update is already in progress."
      )
    }
    guard let navigator, let publication else {
      return publicationDataUnavailableResult()
    }
    let expectedGeneration = generation
    let commandId = beginProgrammaticNavigationActivity()
    activeNavigationCommandId = commandId
    defer {
      if activeNavigationCommandId == commandId {
        activeNavigationCommandId = nil
      }
      endProgrammaticNavigationActivity(commandId)
    }
    let options = NavigatorGoOptions(animated: animated)
    let success = forward
      ? await navigator.goForward(options: options)
      : await navigator.goBackward(options: options)
    if success {
      // See `performNavigationCommand`: logical commands have the same
      // asynchronous delegate-settlement boundary.
      try? await Task.sleep(nanoseconds: 180_000_000)
    }
    guard
      expectedGeneration == generation,
      navigator === self.navigator,
      publication === self.publication,
      currentReaderState == .ready
    else {
      return navigationGenerationChangedResult()
    }
    let outcome = NavigationPolicy.outcome(command: .logical, moved: success)
    if case .success(true) = outcome {
      emitProgress(reason: "programmatic")
    }
    if case let .success(moved) = outcome {
      return ["ok": true, "value": moved]
    }
    return navigationErrorResult(
      code: "NAVIGATION_FAILED",
      message: "The native navigator could not perform logical navigation."
    )
  }

  private func beginProgrammaticNavigationActivity() -> Int {
    navigationActivitySerial += 1
    let activityId = navigationActivitySerial
    programmaticNavigationActivityIds.insert(activityId)
    return activityId
  }

  private func endProgrammaticNavigationActivity(_ activityId: Int) {
    programmaticNavigationActivityIds.remove(activityId)
  }

  private func authorizeProgrammaticNavigation(to target: Locator) {
    programmaticNavigationAuthorizationTask?.cancel()
    programmaticNavigationAuthorizationTarget = target
    let expectedGeneration = generation
    programmaticNavigationAuthorizationTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 5_000_000_000)
      guard
        let self,
        !Task.isCancelled,
        expectedGeneration == generation
      else {
        return
      }
      programmaticNavigationAuthorizationTarget = nil
      programmaticNavigationAuthorizationTask = nil
    }
  }

  private func guardViewportResize(at locator: Locator) {
    viewportResizeGuardTask?.cancel()
    viewportResizeTarget = viewportStableLocator(locator)
    let expectedGeneration = generation
    viewportResizeGuardTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: Self.viewportResizeGuardNanoseconds)
      guard
        let self,
        !Task.isCancelled,
        expectedGeneration == generation
      else {
        return
      }
      viewportResizeTarget = nil
      viewportResizeGuardTask = nil
    }
  }

  private func clearViewportResizeGuard() {
    viewportResizeGuardTask?.cancel()
    viewportResizeGuardTask = nil
    viewportResizeTarget = nil
  }

  private func viewportStableLocator(_ locator: Locator) -> Locator {
    locator.copy(locations: {
      $0.position = nil
      $0.totalProgression = nil
    })
  }

  private func beginPaginatedDrag() {
    guard
      effectiveReaderLayout() == "paginated",
      currentReaderState == .ready,
      !isProgrammaticNavigationInFlight,
      preferenceUpdateTask == nil,
      gestureRollbackTask == nil
    else {
      return
    }
    paginatedDragSettlementTask?.cancel()
    paginatedDragSettlementTask = nil
    paginatedDragAnchor = acceptedUserLocation
    paginatedDragCandidate = nil
    paginatedDragInProgress = paginatedDragAnchor != nil
    progressEventTask?.cancel()
    progressEventTask = nil
  }

  /// Scrolled layout with chapter swipes disabled never turns the resource,
  /// so report the attempted crossing the way a rejected move would.
  private func finishScrolledChapterSwipe(at location: CGPoint) {
    guard let start = scrolledSwipeStart else { return }
    scrolledSwipeStart = nil
    guard
      effectiveReaderLayout() == "scrolled",
      configuredNavigationPolicy.chapterTurnGesture == "disabled",
      !configuredNavigationPolicy.inputSuppressed,
      currentReaderState == .ready,
      !isProgrammaticNavigationInFlight,
      gestureRollbackTask == nil,
      let configuration = navigationUnitBoundaryConfiguration,
      let current = acceptedNavigationUnitMatch,
      let locator = acceptedUserLocation ?? navigator?.currentLocation,
      let direction = NavigationUnitBoundaryPolicy.chapterSwipeDirection(
        dx: Double(location.x - start.x),
        dy: Double(location.y - start.y),
        readingProgression: effectiveReadingProgression()
      )
    else {
      return
    }
    let adjacentIndex = current.index + (direction == "forward" ? 1 : -1)
    guard configuration.units.indices.contains(adjacentIndex) else { return }
    emitNavigationUnitBoundary(
      current: current,
      candidate: ReaderNavigationUnitBoundaryMatch(
        index: adjacentIndex,
        precision: current.precision,
        unit: configuration.units[adjacentIndex]
      ),
      locator: locator
    )
  }

  private func finishPaginatedDrag() {
    guard paginatedDragAnchor != nil else { return }
    paginatedDragInProgress = false
    schedulePaginatedDragSettlement()
  }

  private func schedulePaginatedDragSettlement() {
    let expectedGeneration = generation
    guard let expectedNavigator = navigator else { return }
    paginatedDragSettlementTask?.cancel()
    paginatedDragSettlementTask = Task { [weak self, weak expectedNavigator] in
      try? await Task.sleep(nanoseconds: Self.paginatedDragSettlementNanoseconds)
      guard
        let self,
        let expectedNavigator,
        !Task.isCancelled,
        expectedGeneration == generation,
        expectedNavigator === navigator,
        currentReaderState == .ready
      else {
        return
      }
      let anchor = paginatedDragAnchor
      let candidate = paginatedDragCandidate ?? expectedNavigator.currentLocation
      paginatedDragSettlementTask = nil
      paginatedDragAnchor = nil
      paginatedDragCandidate = nil
      paginatedDragInProgress = false
      guard let anchor, let candidate else { return }
      if locatorMatchesTarget(candidate, anchor) {
        acceptedUserLocation = candidate
        updateAcceptedNavigationUnitMatch(candidate)
        return
      }
      acceptedUserLocation = anchor
      updateAcceptedNavigationUnitMatch(anchor)
      if !handleUserLocationCandidate(candidate, navigator: expectedNavigator) {
        emitProgress(reason: pendingUserLocationReason)
      }
    }
  }

  private func clearPaginatedDrag() {
    paginatedDragSettlementTask?.cancel()
    paginatedDragSettlementTask = nil
    paginatedDragAnchor = nil
    paginatedDragCandidate = nil
    paginatedDragInProgress = false
  }

  private func isProgrammaticNavigationAuthorized(for locator: Locator) -> Bool {
    guard let target = programmaticNavigationAuthorizationTarget else {
      return false
    }
    return locatorMatchesTarget(locator, target)
  }

  private func locatorMatchesTarget(_ current: Locator, _ target: Locator) -> Bool {
    NavigationPolicy.locatorSettled(
      resourceMatches: resourcePathsMatch(current.href, target.href),
      currentPosition: current.locations.position,
      targetPosition: target.locations.position,
      currentProgression: current.locations.progression,
      targetProgression: target.locations.progression,
      currentTotalProgression: current.locations.totalProgression,
      targetTotalProgression: target.locations.totalProgression
    )
  }

  private func clearProgrammaticNavigationAuthorization() {
    programmaticNavigationAuthorizationTask?.cancel()
    programmaticNavigationAuthorizationTask = nil
    programmaticNavigationAuthorizationTarget = nil
  }

  private func publicationLink(
    withHREF href: String,
    in publication: Publication
  ) -> ReadiumShared.Link? {
    func find(in links: [ReadiumShared.Link]) -> ReadiumShared.Link? {
      for link in links {
        if link.href == href || link.url().string == href {
          return link
        }
        if let child = find(in: link.children) {
          return child
        }
      }
      return nil
    }
    return find(
      in: publication.manifest.tableOfContents
        + publication.readingOrder
        + publication.resources
        + publication.links
    )
  }

  private func navigationGenerationChangedResult() -> [String: Any] {
    [
      "error": [
        "code": "READER_NOT_READY",
        "message": "The reader generation changed during navigation.",
        "phase": "navigate",
        "recoverable": true,
      ],
      "ok": false,
    ]
  }

  private func navigationErrorResult(code: String, message: String) -> [String: Any] {
    [
      "error": [
        "code": code,
        "message": message,
        "phase": "navigate",
        "recoverable": true,
      ],
      "ok": false,
    ]
  }

  private func decorationErrorResult(_ message: String) -> [String: Any] {
    [
      "error": [
        "code": "NATIVE_INVARIANT_VIOLATION",
        "message": message,
        "phase": "render",
        "recoverable": true,
      ],
      "ok": false,
    ]
  }

  private func commandErrorResult() -> [String: Any]? {
    guard
      let code = ReaderEventProtocol.commandErrorCode(
        state: currentReaderState,
        destroyed: false
      )
    else {
      return nil
    }
    let destroyed = code == .readerDestroyed
    return [
      "error": [
        "code": code.rawValue,
        "message": destroyed
          ? "The native reader view has been destroyed."
          : "The native reader is not ready for commands.",
        "phase": destroyed ? "close" : "render",
        "recoverable": !destroyed,
      ],
      "ok": false,
    ]
  }

  private func publicationDataUnavailableResult() -> [String: Any] {
    [
      "error": [
        "code": "NATIVE_INVARIANT_VIOLATION",
        "message": "Publication data is unavailable for the ready reader generation.",
        "phase": "render",
        "recoverable": false,
      ],
      "ok": false,
    ]
  }

  private func scheduleTypographyDiagnostics(
    for navigator: EPUBNavigatorViewController,
    generation expectedGeneration: Int
  ) {
    guard !diagnosedGenerations.contains(expectedGeneration) else {
      return
    }
    typographyDiagnosticTask?.cancel()
    typographyDiagnosticTask = Task { [weak self, weak navigator] in
      guard let self, let navigator else {
        return
      }

      for attempt in 0 ..< 12 {
        if attempt > 0 {
          try? await Task.sleep(nanoseconds: 200_000_000)
        }
        guard
          !Task.isCancelled,
          isCurrent(expectedGeneration),
          navigator === self.navigator
        else {
          return
        }

        let locatorBefore = navigator.currentLocation
        let result = await navigator.evaluateJavaScript(Self.typographyDiagnosticScript)
        guard
          !Task.isCancelled,
          isCurrent(expectedGeneration),
          navigator === self.navigator,
          case let .success(raw) = result,
          let json = raw as? String,
          let data = json.data(using: .utf8),
          var diagnostics = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
          continue
        }

        let locatorAfter = navigator.currentLocation
        let fontLoaded = diagnostics["fontLoaded"] as? Bool ?? false
        let locatorStable = locatorBefore == locatorAfter
        if (
          (configuredTypographyProfile?.publisherStyles.injectsProfileRules == true && !fontLoaded)
            || !locatorStable
        ), attempt < 11 {
          continue
        }

        diagnostics["platform"] = "ios"
        diagnostics["generation"] = expectedGeneration
        diagnostics["instanceId"] = instanceId
        diagnostics["mode"] = configuredTypographyProfile?.publisherStyles.rawValue ?? "preserve"
        diagnostics["configuredFontFamily"] = installedFonts.first?.family ?? ""
        diagnostics["locatorHref"] = locatorAfter?.href.string ?? ""
        diagnostics["locatorStableDuringProbe"] = locatorStable
        diagnosedGenerations.insert(expectedGeneration)
        onTypographyDiagnostics(diagnostics)
        return
      }
    }
  }

  private static let typographyDiagnosticScript = """
  (() => {
    const styleValue = (selector, property) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : '';
    };
    const urduContentSelector = 'body :lang(ur), body [lang|="ur"], body .urdu';
    const configuredFamily = styleValue(urduContentSelector, 'fontFamily')
      .split(',')[0].trim().replace(/^['\"]|['\"]$/g, '');
    const target = document.querySelector('p');
    let rangeFinite = false;
    if (target) {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (text && text.length > 0) {
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, Math.min(text.length, 4));
        const rect = range.getBoundingClientRect();
        rangeFinite = [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
          && rect.width >= 0 && rect.height > 0;
      }
    }
    return JSON.stringify({
      markerMode: document.querySelector('style[data-native-epub-kit-typography]')
        ?.getAttribute('data-native-epub-kit-typography') ?? null,
      configuredFamily,
      fontLoaded: configuredFamily.length > 0
        ? document.fonts.check(`16px "${configuredFamily.replaceAll('"', '\\"')}"`)
        : false,
      regularFaceLoaded: configuredFamily.length > 0
        ? document.fonts.check(`400 16px "${configuredFamily.replaceAll('"', '\\"')}"`)
        : false,
      boldFaceLoaded: configuredFamily.length > 0
        ? document.fonts.check(`700 16px "${configuredFamily.replaceAll('"', '\\"')}"`)
        : false,
      fontsStatus: document.fonts.status,
      rootBackgroundColor: styleValue(':root', 'backgroundColor'),
      bodyBackgroundColor: styleValue('body', 'backgroundColor'),
      bodyColor: styleValue('body', 'color'),
      bodyFontFamily: styleValue('body', 'fontFamily'),
      bodyDirection: styleValue('body', 'direction'),
      englishFontFamily: styleValue(':lang(en), [lang|="en"], .english', 'fontFamily'),
      englishDirection: styleValue(':lang(en), [lang|="en"], .english', 'direction'),
      arabicFontFamily: styleValue(':lang(ar), [lang|="ar"], .arabic', 'fontFamily'),
      arabicDirection: styleValue(':lang(ar), [lang|="ar"], .arabic', 'direction'),
      urduFontFamily: styleValue(urduContentSelector, 'fontFamily'),
      urduDirection: styleValue(urduContentSelector, 'direction'),
      quranicFontFamily: styleValue('.quranic', 'fontFamily'),
      quranicDirection: styleValue('.quranic', 'direction'),
      quranicColor: styleValue('.quranic', 'color'),
      linkColor: styleValue('a', 'color'),
      rangeFinite,
      selectionApiAvailable: typeof window.getSelection === 'function'
    });
  })()
  """

  @discardableResult
  private func nextGeneration() -> Int {
    generation += 1
    return generation
  }

  @discardableResult
  private func invalidateCurrentGeneration() -> Int {
    let invalidatedGeneration = nextGeneration()
    openTask?.cancel()
    return invalidatedGeneration
  }

  private func isCurrent(_ candidate: Int) -> Bool {
    candidate == generation && isMounted && !Task.isCancelled
  }

  private func emitState(
    _ state: String,
    code: String? = nil,
    phase: String? = nil,
    message: String? = nil,
    recoverable: Bool? = nil,
    generation suppliedGeneration: Int? = nil
  ) {
    let emissionGeneration = suppliedGeneration ?? generation
    guard eventGate.accept(state, generation: emissionGeneration) else {
      return
    }
    guard let sequence = stableEventProtocol.nextEvent(generation: emissionGeneration) else {
      return
    }
    currentReaderState = StableReaderState(rawValue: state) ?? .error

    let hostNavigatorCount = navigator?.parent?.children.count {
      $0 is EPUBNavigatorViewController
    } ?? 0
    let resources = sessionResources.snapshot()
    var sessionDiagnostics: [String: Any] = [
      "activeSessions": resources.activeSessions,
      "completedSessions": resources.completedSessions,
      "forcedReleaseViolations": resources.forcedReleaseViolations,
      "maximumActiveSessions": resources.maximumActiveSessions,
      "maximumOwnedAssets": resources.maximumOwnedAssets,
      "maximumOwnedPublications": resources.maximumOwnedPublications,
      "maximumSourceLeases": resources.maximumSourceLeases,
      "memorySampleCount": resources.memorySamples.count,
      "ownedAssets": resources.ownedAssets,
      "ownedPublications": resources.ownedPublications,
      "sourceLeases": resources.sourceLeases,
    ]
    if let value = resources.latestMemoryBytes {
      sessionDiagnostics["latestMemoryBytes"] = value
    }
    if let value = resources.postWarmupGrowthBytes {
      sessionDiagnostics["postWarmupGrowthBytes"] = value
    }
    if let value = resources.postWarmupSlopeBytesPerCycle {
      sessionDiagnostics["postWarmupSlopeBytesPerCycle"] = value
    }
    if let value = resources.postWarmupMemoryIsBounded {
      sessionDiagnostics["postWarmupMemoryIsBounded"] = value
    }
    var payload: [String: Any] = [
      "state": state,
      "generation": emissionGeneration,
      "instanceId": instanceId,
      "platform": "ios",
      "sequence": sequence,
      "hasNavigator": navigator?.parent != nil,
      "hostNavigatorCount": hostNavigatorCount,
      "sessionDiagnostics": sessionDiagnostics,
    ]
    if let code {
      payload["code"] = code
    }
    if let phase {
      payload["phase"] = phase
    }
    if let message {
      payload["message"] = message
    }
    if let recoverable {
      payload["recoverable"] = recoverable
    }
    onReaderState(payload)
  }
}

private extension CGRect {
  var isFinite: Bool {
    [origin.x, origin.y, size.width, size.height].allSatisfy(\.isFinite)
      && size.width >= 0
      && size.height >= 0
  }

  var eventPayload: [String: Double] {
    [
      "x": origin.x,
      "y": origin.y,
      "width": size.width,
      "height": size.height,
    ]
  }
}
