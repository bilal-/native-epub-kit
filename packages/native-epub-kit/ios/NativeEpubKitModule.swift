import ExpoModulesCore
import ReadiumShared

enum NativeDependencyVersions {
  static let nativeEpubKitVersion = "0.1.0"
  static let readiumSwiftBaseVersion = "3.10.0"
  static let readiumSwiftIntegrationVersion = "3.10.0-fontfix.845"
  static let readiumSwiftRevision = "e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f"
  static let readiumPublicationType = String(reflecting: Publication.self)
}

public final class NativeEpubKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeEpubKit")

    Constant("nativeDependencies") {
      [
        "readiumSwiftBaseVersion": NativeDependencyVersions.readiumSwiftBaseVersion,
        "readiumSwiftIntegrationVersion": NativeDependencyVersions.readiumSwiftIntegrationVersion,
        "readiumSwiftRevision": NativeDependencyVersions.readiumSwiftRevision,
        "readiumPublicationType": NativeDependencyVersions.readiumPublicationType,
      ]
    }

    View(EpubReaderView.self) {
      Prop("footnotePolicyJson") { (view: EpubReaderView, policyJson: String?) in
        view.setFootnotePolicyJson(policyJson)
      }

      Prop("linkPolicyJson") { (view: EpubReaderView, policyJson: String?) in
        view.setLinkPolicyJson(policyJson)
      }

      Prop("imagePolicyJson") { (view: EpubReaderView, policyJson: String?) in
        view.setImagePolicyJson(policyJson)
      }

      Prop("nextResourceSignal") { (view: EpubReaderView, signal: Int?) in
        view.setNextResourceSignal(signal)
      }

      Prop("progressProbeSignal") { (view: EpubReaderView, signal: Int?) in
        view.setProgressProbeSignal(signal)
      }

      Prop("sourceJson") { (view: EpubReaderView, sourceJson: String?) in
        view.setSourceJson(sourceJson)
      }

      AsyncFunction("getCurrentLocation") { (view: EpubReaderView) async in
        await view.getCurrentLocationCommand()
      }

      AsyncFunction("getCurrentSelection") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.getCurrentSelectionCommand()
        }
      }

      AsyncFunction("getPublication") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.getPublicationCommand()
        }
      }

      AsyncFunction("getPositions") { (view: EpubReaderView, offset: Int, limit: Int) in
        MainActor.assumeIsolated {
          view.getPositionsCommand(offset: offset, limit: limit)
        }
      }

      AsyncFunction("getPreferences") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.getPreferencesCommand()
        }
      }

      AsyncFunction("getNavigationPolicy") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.getNavigationPolicyCommand()
        }
      }

      AsyncFunction("setNavigationUnitBoundaries") {
        (view: EpubReaderView, configurationJson: String) in
        MainActor.assumeIsolated {
          view.setNavigationUnitBoundariesCommand(configurationJson: configurationJson)
        }
      }

      AsyncFunction("getDiagnostics") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.getDiagnosticsCommand()
        }
      }

      AsyncFunction("startSearch") {
        (view: EpubReaderView, query: String, optionsJson: String) async in
        await view.startSearchCommand(query: query, optionsJson: optionsJson)
      }

      AsyncFunction("getSearchPage") {
        (view: EpubReaderView, sessionId: String, cursor: String) async in
        await view.getSearchPageCommand(sessionId: sessionId, cursor: cursor)
      }

      AsyncFunction("cancelSearch") { (view: EpubReaderView, sessionId: String) in
        MainActor.assumeIsolated {
          view.cancelSearchCommand(sessionId: sessionId)
        }
      }

      AsyncFunction("resolveImageSource") {
        (view: EpubReaderView, handle: String, use: String) async in
        await view.resolveImageSourceCommand(handle: handle, use: use)
      }

      AsyncFunction("releaseImageSource") { (view: EpubReaderView, id: String) in
        MainActor.assumeIsolated {
          view.releaseImageSourceCommand(id: id)
        }
      }

      AsyncFunction("clearSelection") { (view: EpubReaderView) in
        MainActor.assumeIsolated {
          view.clearSelectionCommand()
        }
      }

      AsyncFunction("setDecorations") {
        (view: EpubReaderView, group: String, decorationsJson: String) in
        MainActor.assumeIsolated {
          view.setDecorationsCommand(group: group, decorationsJson: decorationsJson)
        }
      }

      AsyncFunction("updateDecorations") {
        (view: EpubReaderView, group: String, changesJson: String) in
        MainActor.assumeIsolated {
          view.updateDecorationsCommand(group: group, changesJson: changesJson)
        }
      }

      AsyncFunction("goToLocator") {
        (view: EpubReaderView, locatorJson: String, animated: Bool) async in
        await view.goToLocatorCommand(locatorJson: locatorJson, animated: animated)
      }

      AsyncFunction("goToLink") {
        (view: EpubReaderView, href: String, animated: Bool) async in
        await view.goToLinkCommand(href: href, animated: animated)
      }

      AsyncFunction("goToProgression") {
        (view: EpubReaderView, progression: Double, animated: Bool) async in
        await view.goToProgressionCommand(progression, animated: animated)
      }

      AsyncFunction("goToPosition") {
        (view: EpubReaderView, position: Int, animated: Bool) async in
        await view.goToPositionCommand(position, animated: animated)
      }

      AsyncFunction("goForward") { (view: EpubReaderView, animated: Bool) async in
        await view.goForwardCommand(animated: animated)
      }

      AsyncFunction("goBackward") { (view: EpubReaderView, animated: Bool) async in
        await view.goBackwardCommand(animated: animated)
      }

      Events(
        "onDecorationPress",
        "onFootnotePress",
        "onImagePress",
        "onLinkPress",
        "onLocationChange",
        "onNavigationAction",
        "onNavigationPolicyChange",
        "onNavigationUnitBoundary",
        "onPreferencesChange",
        "onProgress",
        "onReaderState",
        "onSelectionAction",
        "onSelectionChange",
        "onTypographyDiagnostics"
      )
    }
  }
}
