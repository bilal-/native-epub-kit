import Foundation
import ReadiumShared

enum ReaderOpenRequestError: Error, Equatable {
  case invalidLocator
  case invalidNavigationPolicy
  case invalidPreferences
  case invalidSelectionActions
  case invalidSource
  case invalidTypographyProfile
}

struct ReaderOpenRequest {
  let initialLocator: Locator?
  let navigationPolicy: ResolvedReaderNavigationPolicy
  let navigationUnitBoundaryKey: String?
  let navigationUnitBoundariesRequired: Bool
  let preferences: ResolvedReaderPreferences
  let selectionActions: [ResolvedNativeSelectionAction]
  let source: SharedPublicationSourceRecord
  let sourceFingerprint: String
  let typographyProfile: ResolvedTypographyProfile?

  init(jsonString: String, availableFontFamilies: Set<String>? = nil) throws {
    let value: SharedJSONValue
    do {
      value = try JSONDecoder().decode(SharedJSONValue.self, from: Data(jsonString.utf8))
    } catch {
      throw ReaderOpenRequestError.invalidSource
    }
    guard case let .object(object) = value, let sourceValue = object["source"] else {
      throw ReaderOpenRequestError.invalidSource
    }

    do {
      source = try SharedPublicationSourceRecord(validating: sourceValue)
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
      sourceFingerprint = String(decoding: try encoder.encode(sourceValue), as: UTF8.self)
    } catch {
      throw ReaderOpenRequestError.invalidSource
    }

    do {
      navigationPolicy = try ResolvedReaderNavigationPolicy(validating: object["navigationPolicy"])
    } catch {
      throw ReaderOpenRequestError.invalidNavigationPolicy
    }

    if let boundaryRequirement = object["navigationUnitBoundariesRequired"] {
      guard case let .boolean(required) = boundaryRequirement else {
        throw ReaderOpenRequestError.invalidNavigationPolicy
      }
      navigationUnitBoundariesRequired = required
    } else {
      navigationUnitBoundariesRequired = false
    }
    if let boundaryKey = object["navigationUnitBoundaryKey"], boundaryKey != .null {
      guard case let .string(value) = boundaryKey, !value.isEmpty else {
        throw ReaderOpenRequestError.invalidNavigationPolicy
      }
      navigationUnitBoundaryKey = value
    } else {
      navigationUnitBoundaryKey = nil
    }
    guard navigationUnitBoundariesRequired == (navigationUnitBoundaryKey != nil) else {
      throw ReaderOpenRequestError.invalidNavigationPolicy
    }

    do {
      preferences = try ResolvedReaderPreferences(validating: object["preferences"])
    } catch {
      throw ReaderOpenRequestError.invalidPreferences
    }

    do {
      selectionActions = try SelectionActionPolicy.resolve(object["selectionActions"])
    } catch {
      throw ReaderOpenRequestError.invalidSelectionActions
    }

    do {
      if let value = object["typographyProfile"], value != .null {
        typographyProfile = try TypographyProfilePolicy.resolve(
          value,
          availableFontFamilies: availableFontFamilies
        )
      } else {
        typographyProfile = nil
      }
    } catch {
      throw ReaderOpenRequestError.invalidTypographyProfile
    }

    guard let initialValue = object["initialLocator"], initialValue != .null else {
      initialLocator = nil
      return
    }
    do {
      _ = try SharedLocatorRecord(validating: initialValue)
      let data = try JSONEncoder().encode(initialValue)
      initialLocator = try Locator(jsonData: data)
    } catch {
      throw ReaderOpenRequestError.invalidLocator
    }
  }
}
