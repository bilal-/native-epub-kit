import Foundation

struct BoundedSelectionText: Equatable, Sendable {
  let text: String
  let truncated: Bool
}

enum SelectionTextBounder {
  /// Keeps a bridge payload within a UTF-16 limit without splitting a Swift Character.
  static func bound(_ value: String, maximumUTF16Units: Int) -> BoundedSelectionText {
    precondition(maximumUTF16Units >= 0)
    guard value.utf16.count > maximumUTF16Units else {
      return BoundedSelectionText(text: value, truncated: false)
    }
    guard maximumUTF16Units > 0 else {
      return BoundedSelectionText(text: "", truncated: true)
    }

    var boundary = value.startIndex
    var consumedUnits = 0
    while boundary < value.endIndex {
      let nextBoundary = value.index(after: boundary)
      let characterUnits = value[boundary ..< nextBoundary].utf16.count
      guard consumedUnits + characterUnits <= maximumUTF16Units else { break }
      consumedUnits += characterUnits
      boundary = nextBoundary
    }
    return BoundedSelectionText(text: String(value[..<boundary]), truncated: true)
  }

  /// Keeps the suffix nearest a selection while preserving Character boundaries.
  static func boundEnd(_ value: String, maximumUTF16Units: Int) -> BoundedSelectionText {
    precondition(maximumUTF16Units >= 0)
    guard value.utf16.count > maximumUTF16Units else {
      return BoundedSelectionText(text: value, truncated: false)
    }
    guard maximumUTF16Units > 0 else {
      return BoundedSelectionText(text: "", truncated: true)
    }

    var boundary = value.endIndex
    var consumedUnits = 0
    while boundary > value.startIndex {
      let previousBoundary = value.index(before: boundary)
      let characterUnits = value[previousBoundary ..< boundary].utf16.count
      guard consumedUnits + characterUnits <= maximumUTF16Units else { break }
      consumedUnits += characterUnits
      boundary = previousBoundary
    }
    return BoundedSelectionText(text: String(value[boundary...]), truncated: true)
  }
}
