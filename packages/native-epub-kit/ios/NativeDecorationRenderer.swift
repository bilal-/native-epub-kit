import Foundation
import ReadiumNavigator
import ReadiumShared
import UIKit

private struct NativeMarginIconDecorationConfig: Hashable {
  let asset: String
  let tint: UIColor
}

private struct NativeRoundedBoxDecorationConfig: Hashable {
  let tint: UIColor
  let borderRadius: Double
  let borderWidth: Double
  let fillOpacity: Double
  let isActive: Bool
}

enum NativeDecorationRenderer {
  static let marginIconStyleId = Decoration.Style.Id(
    rawValue: "native-epub-kit-margin-icon-v1"
  )
  static let roundedBoxStyleId = Decoration.Style.Id(
    rawValue: "native-epub-kit-rounded-box-v1"
  )

  static func templates() -> [Decoration.Style.Id: HTMLDecorationTemplate] {
    var templates = HTMLDecorationTemplate.defaultTemplates()
    templates[marginIconStyleId] = marginIconTemplate
    templates[roundedBoxStyleId] = roundedBoxTemplate
    return templates
  }

  static func readiumDecoration(_ value: ResolvedNativeDecoration) throws -> Decoration {
    let locator: Locator
    do {
      locator = try Locator(jsonData: JSONEncoder().encode(value.locator))
    } catch {
      throw DecorationPolicyError(path: "$/decoration/locator", reason: "is not a Readium locator")
    }

    let style: Decoration.Style
    switch value.style {
    case let .highlight(tint, isActive):
      style = .highlight(tint: try color(tint), isActive: isActive)
    case let .underline(tint, isActive):
      style = .underline(tint: try color(tint), isActive: isActive)
    case let .marginIcon(asset, tint):
      style = Decoration.Style(
        id: marginIconStyleId,
        config: NativeMarginIconDecorationConfig(asset: asset, tint: try color(tint))
      )
    case let .roundedBox(tint, borderRadius, borderWidth, fillOpacity, isActive):
      style = Decoration.Style(
        id: roundedBoxStyleId,
        config: NativeRoundedBoxDecorationConfig(
          tint: try color(tint),
          borderRadius: borderRadius,
          borderWidth: borderWidth,
          fillOpacity: fillOpacity,
          isActive: isActive
        )
      )
    }
    return Decoration(id: value.id, locator: locator, style: style)
  }

  private static func color(_ value: String) throws -> UIColor {
    let digits = value.dropFirst()
    guard let raw = UInt64(digits, radix: 16), digits.count == 6 || digits.count == 8 else {
      throw DecorationPolicyError(path: "$/decoration/style/tint", reason: "is invalid")
    }
    let red: UInt64
    let green: UInt64
    let blue: UInt64
    let alpha: UInt64
    if digits.count == 8 {
      red = (raw >> 24) & 0xFF
      green = (raw >> 16) & 0xFF
      blue = (raw >> 8) & 0xFF
      alpha = raw & 0xFF
    } else {
      red = (raw >> 16) & 0xFF
      green = (raw >> 8) & 0xFF
      blue = raw & 0xFF
      alpha = 0xFF
    }
    return UIColor(
      red: CGFloat(red) / 255,
      green: CGFloat(green) / 255,
      blue: CGFloat(blue) / 255,
      alpha: CGFloat(alpha) / 255
    )
  }

  private static let marginIconTemplate = HTMLDecorationTemplate(
    layout: .bounds,
    width: .page,
    element: { decoration in
      guard let config = decoration.style.config as? NativeMarginIconDecorationConfig else {
        return "<div/>"
      }
      let assetClass = config.asset == "bookmark" ? "bookmark" : "note"
      return """
      <div><span data-activable="1" class="native-epub-kit-margin-icon \(assetClass)" style="--native-epub-kit-decoration-tint: \(config.tint.cssValue())"></span></div>
      """
    },
    stylesheet: """
    .native-epub-kit-margin-icon {
      position: absolute;
      inset-block-start: 1px;
      inset-inline-start: 8px;
      width: 20px;
      height: 20px;
      box-sizing: border-box;
      background-color: var(--native-epub-kit-decoration-tint);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
      opacity: 0.9;
    }
    .native-epub-kit-margin-icon.bookmark {
      border-radius: 2px 2px 1px 1px;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
    }
    .native-epub-kit-margin-icon.note {
      border: 3px solid var(--native-epub-kit-decoration-tint);
      border-radius: 50%;
      background: var(--RS__backgroundColor);
    }
    .native-epub-kit-margin-icon.note::after {
      content: "";
      position: absolute;
      inset: 5px;
      border-radius: 50%;
      background-color: var(--native-epub-kit-decoration-tint);
    }
    """
  )

  private static let roundedBoxTemplate = HTMLDecorationTemplate(
    layout: .boxes,
    element: { decoration in
      guard let config = decoration.style.config as? NativeRoundedBoxDecorationConfig else {
        return "<div/>"
      }
      let shadow = config.isActive
        ? "box-shadow: 0 0 0 2px \(config.tint.cssValue(alpha: 0.35));"
        : ""
      return """
      <div data-activable="1" class="native-epub-kit-rounded-box" style="background-color: \(config.tint.cssValue(alpha: config.fillOpacity)); border-color: \(config.tint.cssValue()); border-radius: \(config.borderRadius)px; border-width: \(config.borderWidth)px; \(shadow)"></div>
      """
    },
    stylesheet: """
    .native-epub-kit-rounded-box {
      box-sizing: border-box;
      border-style: solid;
      margin: 0 -1px;
      padding: 0 2px;
    }
    """
  )
}
