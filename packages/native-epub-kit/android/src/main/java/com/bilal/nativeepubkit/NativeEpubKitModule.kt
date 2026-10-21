package com.bilal.nativeepubkit

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NativeEpubKitModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NativeEpubKit")

    Constant("nativeDependencies") {
      mapOf(
        "readiumKotlin" to NativeDependencyVersions.READIUM_KOTLIN,
        "readiumPublicationClass" to NativeDependencyVersions.READIUM_PUBLICATION_CLASS
      )
    }

    View(EpubReaderView::class) {
      Prop("footnotePolicyJson") { view: EpubReaderView, policyJson: String? ->
        view.setFootnotePolicyJson(policyJson)
      }

      Prop("linkPolicyJson") { view: EpubReaderView, policyJson: String? ->
        view.setLinkPolicyJson(policyJson)
      }

      Prop("imagePolicyJson") { view: EpubReaderView, policyJson: String? ->
        view.setImagePolicyJson(policyJson)
      }

      Prop("nextResourceSignal") { view: EpubReaderView, signal: Int? ->
        view.setNextResourceSignal(signal)
      }

      Prop("progressProbeSignal") { view: EpubReaderView, signal: Int? ->
        view.setProgressProbeSignal(signal)
      }

      Prop("sourceJson") { view: EpubReaderView, sourceJson: String? ->
        view.setSourceJson(sourceJson)
      }

      AsyncFunction("getCurrentLocation") Coroutine { view: EpubReaderView ->
        view.getCurrentLocationCommand()
      }

      AsyncFunction("getCurrentSelection") { view: EpubReaderView ->
        view.getCurrentSelectionCommand()
      }

      AsyncFunction("getPublication") { view: EpubReaderView ->
        view.getPublicationCommand()
      }

      AsyncFunction("getPositions") { view: EpubReaderView, offset: Int, limit: Int ->
        view.getPositionsCommand(offset, limit)
      }

      AsyncFunction("getPreferences") { view: EpubReaderView ->
        view.getPreferencesCommand()
      }

      AsyncFunction("getNavigationPolicy") { view: EpubReaderView ->
        view.getNavigationPolicyCommand()
      }

      AsyncFunction("setNavigationUnitBoundaries") {
          view: EpubReaderView,
          configurationJson: String,
        ->
        view.setNavigationUnitBoundariesCommand(configurationJson)
      }

      AsyncFunction("getDiagnostics") { view: EpubReaderView ->
        view.getDiagnosticsCommand()
      }

      AsyncFunction("startSearch") Coroutine {
          view: EpubReaderView,
          query: String,
          optionsJson: String,
        ->
        view.startSearchCommand(query, optionsJson)
      }

      AsyncFunction("getSearchPage") Coroutine {
          view: EpubReaderView,
          sessionId: String,
          cursor: String,
        ->
        view.getSearchPageCommand(sessionId, cursor)
      }

      AsyncFunction("cancelSearch") { view: EpubReaderView, sessionId: String ->
        view.cancelSearchCommand(sessionId)
      }

      AsyncFunction("resolveImageSource") Coroutine {
          view: EpubReaderView,
          handle: String,
          use: String,
        ->
        view.resolveImageSourceCommand(handle, use)
      }

      AsyncFunction("releaseImageSource") { view: EpubReaderView, id: String ->
        view.releaseImageSourceCommand(id)
      }

      AsyncFunction("clearSelection") { view: EpubReaderView ->
        view.clearSelectionCommand()
      }

      AsyncFunction("setDecorations") Coroutine {
          view: EpubReaderView,
          group: String,
          decorationsJson: String,
        ->
        view.setDecorationsCommand(group, decorationsJson)
      }

      AsyncFunction("updateDecorations") Coroutine {
          view: EpubReaderView,
          group: String,
          changesJson: String,
        ->
        view.updateDecorationsCommand(group, changesJson)
      }

      AsyncFunction("goToLocator") Coroutine {
          view: EpubReaderView,
          locatorJson: String,
          animated: Boolean,
        ->
        view.goToLocatorCommand(locatorJson, animated)
      }

      AsyncFunction("goToLink") Coroutine {
          view: EpubReaderView,
          href: String,
          animated: Boolean,
        ->
        view.goToLinkCommand(href, animated)
      }

      AsyncFunction("goToProgression") Coroutine {
          view: EpubReaderView,
          progression: Double,
          animated: Boolean,
        ->
        view.goToProgressionCommand(progression, animated)
      }

      AsyncFunction("goToPosition") Coroutine {
          view: EpubReaderView,
          position: Int,
          animated: Boolean,
        ->
        view.goToPositionCommand(position, animated)
      }

      AsyncFunction("goForward") Coroutine { view: EpubReaderView, animated: Boolean ->
        view.goForwardCommand(animated)
      }

      AsyncFunction("goBackward") Coroutine { view: EpubReaderView, animated: Boolean ->
        view.goBackwardCommand(animated)
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
        "onTypographyDiagnostics",
      )

      OnViewDestroys { view: EpubReaderView ->
        view.dispose()
      }
    }
  }
}
