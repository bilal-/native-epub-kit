import Foundation

private struct ContractManifest: Decodable {
  let schemaVersion: Int
  let recordTypes: [String]
  let enums: [String: [String]]
  let units: [String: String]
  let nullability: [String: String]
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  guard condition() else {
    fatalError(message)
  }
}

guard CommandLine.arguments.count == 2 else {
  fatalError("Expected the core-v1 contract directory path")
}

let contractRoot = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let casesDirectory = contractRoot.appending(path: "cases", directoryHint: .isDirectory)
let decoder = JSONDecoder()
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

do {
  let fileURLs = try FileManager.default.contentsOfDirectory(
    at: casesDirectory,
    includingPropertiesForKeys: nil
  )
  .filter { $0.pathExtension == "json" }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }
  require(fileURLs.count == 15, "Expected fifteen core-v1 golden cases")

  var seenTypes = Set<SharedCoreRecordType>()
  for fileURL in fileURLs {
    let data = try Data(contentsOf: fileURL)
    let envelope = try decoder.decode(SharedCoreRecordEnvelope.self, from: data)
    require(envelope.schemaVersion == 1, "\(fileURL.lastPathComponent) schema changed")
    require(
      envelope.caseId == fileURL.deletingPathExtension().lastPathComponent,
      "\(fileURL.lastPathComponent) case ID changed"
    )
    require(seenTypes.insert(envelope.recordType).inserted, "Duplicate core record type")

    let encoded = try encoder.encode(envelope)
    let roundTripped = try decoder.decode(SharedCoreRecordEnvelope.self, from: encoded)
    require(roundTripped == envelope, "\(fileURL.lastPathComponent) did not round-trip")
  }
  require(
    seenTypes == Set(SharedCoreRecordType.allCases),
    "Swift core record dispatch does not match the golden record set"
  )

  let manifest = try decoder.decode(
    ContractManifest.self,
    from: Data(contentsOf: contractRoot.appending(path: "manifest.json"))
  )
  require(manifest.schemaVersion == 1, "Manifest schema changed")
  require(
    manifest.recordTypes == SharedCoreRecordType.allCases.map(\.rawValue),
    "Swift record type order differs from the manifest"
  )
  require(manifest.enums == SharedCoreRecordContract.enumValues, "Swift enum values differ")
  require(manifest.units == SharedCoreRecordContract.units, "Swift units differ")
  require(manifest.nullability == SharedCoreRecordContract.nullability, "Swift nullability differs")

  let invalidProgression = Data(
    """
    {
      "schemaVersion": 1,
      "caseId": "invalid-progression",
      "recordType": "locator",
      "payload": {
        "href": "text/chapter.xhtml",
        "type": "application/xhtml+xml",
        "locations": { "progression": 1.1 }
      }
    }
    """.utf8
  )
  do {
    _ = try decoder.decode(SharedCoreRecordEnvelope.self, from: invalidProgression)
    fatalError("Swift accepted an out-of-range progression")
  } catch let error as SharedRecordValidationError {
    require(error.path == "$/locations/progression", "Swift validation path changed")
  }

  let mappedError = try SharedReaderErrorMapper.record(
    nativeCode: "NAVIGATOR_RUNTIME_FAILED",
    nativePhase: "webview",
    message: "The navigator failed.",
    recoverable: true
  )
  require(mappedError.code == .resourceLoadFailed, "Swift error alias changed")
  require(mappedError.phase == .render, "Swift error phase fallback changed")
  guard case let .object(mappedObject) = mappedError.jsonValue,
        case let .object(nativeDetails)? = mappedObject["nativeDetails"]
  else {
    fatalError("Swift mapped error omitted native identity")
  }
  require(
    nativeDetails["nativeCode"] == .string("NAVIGATOR_RUNTIME_FAILED"),
    "Swift mapped error omitted original code"
  )

  print("Swift core-v1 records: 15 golden cases, enums, units, nullability, rejection, and error mapping pass")
} catch {
  fatalError("Swift core-v1 contract failure: \(error)")
}
