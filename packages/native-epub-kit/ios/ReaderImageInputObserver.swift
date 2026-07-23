import Foundation
@_spi(ExperimentalTargetElement) import ReadiumNavigator
import ReadiumShared

@MainActor
final class ReaderImageInputObserver: InputObserving {
  typealias ActivationHandler = @MainActor (PointerEvent.TargetElement) -> Void

  private let onActivation: ActivationHandler

  init(onActivation: @escaping ActivationHandler) {
    self.onActivation = onActivation
  }

  func didReceive(_ event: PointerEvent) async -> Bool {
    guard event.phase == .up, let target = event.targetElement else { return false }
    guard target.content is ImageContentElement || target.content is SVGContentElement else {
      return false
    }
    onActivation(target)
    return true
  }

  func didReceive(_: KeyEvent) async -> Bool {
    false
  }
}
