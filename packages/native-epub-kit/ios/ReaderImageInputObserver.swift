import Foundation
@_spi(ExperimentalTargetElement) import ReadiumNavigator
import ReadiumShared

/// Opens publication images on a tap or main click only. Readium's activation
/// recognizer fails on movement and multi-touch, so page swipes and pinches
/// that begin on an image never present the image viewer.
@MainActor
final class ReaderImageInputObserver: InputObserving {
  typealias ActivationHandler = @MainActor (PointerEvent.TargetElement) -> Void

  private let activation: ActivatePointerObserver

  init(onActivation: @escaping ActivationHandler) {
    activation = .activate { event in
      guard let target = event.targetElement else { return false }
      guard target.content is ImageContentElement || target.content is SVGContentElement else {
        return false
      }
      onActivation(target)
      return true
    }
  }

  func didReceive(_ event: PointerEvent) async -> Bool {
    await activation.didReceive(event)
  }

  func didReceive(_ event: KeyEvent) async -> Bool {
    await activation.didReceive(event)
  }
}
