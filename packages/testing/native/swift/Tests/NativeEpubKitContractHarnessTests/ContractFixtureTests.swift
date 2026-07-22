import Foundation
import NativeEpubKitContractHarness
import Testing

private let contractCasesDirectory: URL = {
  var source = URL(fileURLWithPath: #filePath)
  for _ in 0..<5 {
    source.deleteLastPathComponent()
  }
  return source.appending(path: "contracts/qualification-v0/cases", directoryHint: .isDirectory)
}()

@Test("Shared JSON contract cases decode and round-trip in Swift")
func sharedContractCasesRoundTrip() throws {
  let fileURLs = try FileManager.default.contentsOfDirectory(
    at: contractCasesDirectory,
    includingPropertiesForKeys: nil
  )
  .filter { $0.pathExtension == "json" }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }

  #expect(fileURLs.count == 4)
  var caseIds = Set<String>()
  let decoder = JSONDecoder()
  let encoder = JSONEncoder()

  for fileURL in fileURLs {
    let fixture = try decoder.decode(ContractFixture.self, from: Data(contentsOf: fileURL))
    #expect(fixture.schemaVersion == 1)
    #expect(fixture.caseId == fileURL.deletingPathExtension().lastPathComponent)
    #expect(caseIds.insert(fixture.caseId).inserted)

    let roundTripped = try decoder.decode(ContractFixture.self, from: encoder.encode(fixture))
    #expect(roundTripped == fixture)

    for pointer in fixture.expectations.requiredJsonPointers {
      #expect(fixture.jsonValue.value(atJSONPointer: pointer) != nil)
    }
    for pointer in fixture.expectations.explicitNullJsonPointers {
      #expect(fixture.jsonValue.value(atJSONPointer: pointer) == .null)
    }
  }
}
