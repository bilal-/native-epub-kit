import Foundation

private struct Contract: Decodable {
  let version: Int
  let cases: [ContractCase]
}

private struct ContractCase: Decodable {
  let name: String
  let steps: [Step]
}

private struct Step: Decodable {
  let generation: Int
  let state: String
  let accepted: Bool
}

private struct SessionContract: Decodable {
  let version: Int
  let states: [String]
  let cases: [SessionContractCase]
}

private struct SessionContractCase: Decodable {
  let name: String
  let steps: [SessionStep]
}

private struct SessionStep: Decodable {
  let state: String
  let accepted: Bool
}

private struct ReaderAPIContract: Decodable {
  let version: Int
  let locationThrottleMilliseconds: Int64
  let commandCases: [ReaderCommandCase]
  let eventCases: [ReaderEventCase]
}

private struct ReaderCommandCase: Decodable {
  let state: String
  let destroyed: Bool
  let errorCode: String?
}

private struct ReaderEventCase: Decodable {
  let name: String
  let steps: [ReaderEventStep]
}

private struct ReaderEventStep: Decodable {
  let kind: String
  let generation: Int
  let reason: String?
  let timestampMilliseconds: Int64?
  let accepted: Bool
  let sequence: Int?
}

private struct PublicationDataContract: Decodable {
  let version: Int
  let defaultPositionPageSize: Int
  let maximumPositionPageSize: Int
  let pageCases: [PublicationPageCase]
  let tocCases: [PublicationTOCCase]
}

private struct PublicationPageCase: Decodable {
  let name: String
  let total: Int
  let offset: Int
  let limit: Int?
  let expectedOffset: Int
  let expectedCount: Int
  let expectedNextOffset: Int?
}

private struct PublicationTOCCase: Decodable {
  let name: String
  let tableOfContents: [PublicationDataLinkShape]
  let readingOrderHrefs: [String]
  let positionCount: Int
  let fixedLayout: Bool
  let expectedWarnings: [String]
}

private struct NavigationContract: Decodable {
  let version: Int
  let maximumBridgePosition: Int
  let progressionCases: [NavigationNumericCase]
  let positionCases: [NavigationNumericCase]
  let outcomeCases: [NavigationOutcomeCase]
  let restoreReasonCases: [NavigationRestoreReasonCase]
}

private struct NavigationNumericCase: Decodable {
  let name: String
  let value: Double
  let valid: Bool
}

private struct NavigationOutcomeCase: Decodable {
  let name: String
  let command: String
  let moved: Bool
  let expected: String
}

private struct NavigationRestoreReasonCase: Decodable {
  let name: String
  let hasLocator: Bool
  let preferenceChange: Bool
  let expected: String
}

private struct PreferencesContract: Decodable {
  let version: Int
  let defaults: SharedJSONValue
  let ranges: [String: PreferenceRange]
  let normalizationCases: [PreferenceNormalizationCase]
  let policyCases: [PreferencePolicyCase]
}

private struct NavigationPolicyContract: Decodable {
  let version: Int
  let defaults: SharedJSONValue
}

private struct NavigationBoundariesContract: Decodable {
  let version: Int
  let maximumHistoryEntries: Int
  let boundaryCases: [NavigationBoundaryCase]
  let units: [ReaderNavigationUnitBoundary]
}

private struct NavigationBoundaryCase: Decodable {
  let name: String
  let precision: String
  let preferredUnitId: String?
  let location: ReaderNavigationBoundaryLocation
  let expected: NavigationBoundaryExpected
}

private struct NavigationBoundaryExpected: Decodable {
  let unitId: String
  let precision: String
}

private struct PreferenceRange: Decodable {
  let minimum: Double
  let maximum: Double
}

private struct PreferenceNormalizationCase: Decodable {
  let name: String
  let input: SharedJSONValue
  let valid: Bool
}

private struct PreferencePolicyCase: Decodable {
  let name: String
  let layout: String
  let preferences: SharedJSONValue
  let applied: [String]
  let unsupported: [String: String]
  let warnings: [String]
}

private struct DiagnosticsContract: Decodable {
  let version: Int
  let schemaVersion: Int
  let sdk: DiagnosticsSDK
  let featureNames: [String]
  let limits: DiagnosticsLimits
  let redaction: DiagnosticsRedaction
  let cases: [DiagnosticsCase]
}

private struct DiagnosticsSDK: Decodable {
  let name: String
  let version: String
}

private struct DiagnosticsLimits: Decodable {
  let maximumWarnings: Int
}

private struct DiagnosticsRedaction: Decodable {
  let forbiddenKeys: [String]
  let forbiddenFragments: [String]
}

private struct DiagnosticsCase: Decodable {
  let name: String
  let platform: String
  let toolkit: DiagnosticsToolkit
  let publication: DiagnosticsPublication
  let fonts: DiagnosticsFonts
  let preferences: SharedJSONValue
  let expected: DiagnosticsExpected
}

private struct DiagnosticsToolkit: Decodable {
  let name: String
  let version: String
  let revision: String
}

private struct DiagnosticsPublication: Decodable {
  let layout: String
  let readingProgression: String
  let positionCount: Int
  let progressPrecision: String
  let mappingDurationMilliseconds: Int
  let capabilities: [String: Bool]
  let warnings: [String]
}

private struct DiagnosticsFonts: Decodable {
  let status: String
  let faceCount: Int
  let familyCount: Int
}

private struct DiagnosticsExpected: Decodable {
  let enabled: [String]
  let stages: [String: String]
  let warnings: [String]
}

private struct FontManifestContract: Decodable {
  let version: Int
  let schemaVersion: Int
  let maximumFaces: Int
  let cases: [FontManifestCase]
}

private struct FontManifestCase: Decodable {
  let name: String
  let platform: NativeFontPlatform
  let manifest: SharedJSONValue?
  let availableFiles: [String]
  let expected: FontManifestExpected
}

private struct FontManifestExpected: Decodable {
  let status: String
  let faceCount: Int
  let familyCount: Int
  let families: [FontManifestExpectedFamily]
}

private struct FontManifestExpectedFamily: Decodable {
  let family: String
  let faces: [FontManifestExpectedFace]
}

private struct FontManifestExpectedFace: Decodable {
  let file: String
  let style: String
  let weight: Int
}

private struct TypographyProfileContract: Decodable {
  let version: Int
  let maximumRules: Int
  let maximumFontFamilies: Int
  let cases: [TypographyProfileCase]
}

private struct TypographyProfileCase: Decodable {
  let name: String
  let availableFontFamilies: [String]
  let profile: SharedJSONValue?
  let expected: TypographyProfileExpected
}

private struct TypographyProfileExpected: Decodable {
  let status: String
  let profile: SharedJSONValue?
  let stylesheet: String
}

private struct FootnoteLinkPolicyContract: Decodable {
  let version: Int
  let maximumHeuristicRules: Int
  let maximumExternalSchemes: Int
  let footnoteCases: [FootnotePolicyCase]
  let linkCases: [LinkPolicyCase]
}

private struct FootnotePolicyCase: Decodable {
  let name: String
  let policy: SharedJSONValue?
  let href: String
  let semantic: Bool
  let expectedPolicy: SharedJSONValue?
  let expectedDecision: SharedJSONValue?
  let expectedError: Bool?
}

private struct LinkPolicyCase: Decodable {
  let name: String
  let policy: SharedJSONValue?
  let href: String
  let expectedPolicy: SharedJSONValue?
  let expectedDecision: SharedJSONValue?
  let expectedError: Bool?
}

private struct SelectionActionPolicyContract: Decodable {
  let version: Int
  let maximumActions: Int
  let maximumActionIdUtf16Units: Int
  let maximumActionTitleUtf16Units: Int
  let maximumSelectionTextUtf16Units: Int
  let maximumSelectionContextUtf16Units: Int
  let actionCases: [SelectionActionCase]
  let directionCases: [SelectionDirectionCase]
}

private struct SelectionActionCase: Decodable {
  let name: String
  let actions: SharedJSONValue?
  let expected: SharedJSONValue?
  let expectedError: Bool?
}

private struct SelectionDirectionCase: Decodable {
  let name: String
  let text: String
  let expected: String
}

private struct DecorationPolicyContract: Decodable {
  let version: Int
  let maximumGroups: Int
  let maximumDecorationsPerGroup: Int
  let maximumChanges: Int
  let maximumGroupUtf16Units: Int
  let maximumIdUtf16Units: Int
  let maximumDataUtf8Bytes: Int
  let baseLocator: SharedJSONValue
  let groupCases: [DecorationGroupCase]
  let styleCases: [DecorationStyleCase]
  let deltaCases: [DecorationDeltaCase]
}

private struct DecorationGroupCase: Decodable {
  let name: String
  let input: String
  let expected: String?
  let expectedError: Bool?
}

private struct DecorationStyleCase: Decodable {
  let name: String
  let input: SharedJSONValue
  let expected: SharedJSONValue?
  let expectedError: Bool?
}

private struct DecorationShape: Decodable {
  let id: String
  let style: SharedJSONValue
}

private struct DecorationDeltaChangeShape: Decodable {
  let type: String
  let id: String?
  let decoration: DecorationShape?
}

private struct DecorationDeltaCase: Decodable {
  let name: String
  let initial: [DecorationShape]
  let changes: [DecorationDeltaChangeShape]
  let expected: [DecorationShape]?
  let expectedError: Bool?
}

private struct ImagePolicyContract: Decodable {
  let version: Int
  let defaults: SharedJSONValue
  let cases: [ImagePolicyCase]
}

private struct ImagePolicyCase: Decodable {
  let name: String
  let policy: SharedJSONValue?
  let expected: SharedJSONValue?
  let expectedError: Bool?
  let uses: [String: Bool]?
}

private struct SearchPolicyContract: Decodable {
  let version: Int
  let bounds: SearchPolicyBounds
  let defaults: SharedJSONValue
  let decorationGroups: SharedJSONValue
  let requestCases: [SearchRequestCase]
  let excerptCases: [SearchExcerptCase]
}

private struct SearchPolicyBounds: Decodable {
  let defaultPageSize: Int
  let maximumPageSize: Int
  let maximumResults: Int
  let maximumQueryUtf16Units: Int
  let maximumLanguageUtf16Units: Int
  let maximumExcerptContextUtf16Units: Int
  let maximumExcerptHighlightUtf16Units: Int
  let maximumResourceTitleUtf16Units: Int
  let maximumSessionIdUtf16Units: Int
  let maximumCursorUtf16Units: Int
}

private struct SearchRepeatValue: Decodable {
  let value: String
  let count: Int
}

private struct SearchRequestCase: Decodable {
  let name: String
  let query: String?
  let queryRepeat: SearchRepeatValue?
  let options: SharedJSONValue?
  let expected: SharedJSONValue?
  let expectedError: Bool?
}

private struct SearchExcerptLengths: Decodable {
  let before: Int
  let highlight: Int
  let after: Int
}

private struct SearchExcerptCase: Decodable {
  let name: String
  let before: String?
  let beforeRepeat: SearchRepeatValue?
  let highlight: String
  let after: String?
  let afterRepeat: SearchRepeatValue?
  let expected: SharedJSONValue?
  let expectedLengths: SearchExcerptLengths?
  let expectedTruncated: Bool?
}

@main
private enum LifecycleHarnessMain {
  static func main() throws {
    guard CommandLine.arguments.count == 17 else {
      throw HarnessError(
        "Expected view, session, reader-API, publication-data, navigation, preferences, navigation-policy, navigation-boundaries, diagnostics, font-manifest, typography-profile, footnote/link-policy, selection-action-policy, decoration-policy, image-policy, and search-policy paths"
      )
    }

    let contract = try JSONDecoder().decode(
      Contract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    )
    try expect(contract.version == 1, "Unexpected lifecycle contract version")

    for testCase in contract.cases {
      let gate = ReaderLifecycleGate()
      for (index, step) in testCase.steps.enumerated() {
        try expect(
          gate.accept(step.state, generation: step.generation) == step.accepted,
          "\(testCase.name) step \(index)"
        )
      }
    }

    let sessionContract = try JSONDecoder().decode(
      SessionContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))
    )
    try expect(sessionContract.version == 1, "Unexpected publication-session contract version")
    try expect(
      sessionContract.states == PublicationSessionLifecycleState.allCases.map(\.rawValue),
      "Publication-session state parity"
    )
    for testCase in sessionContract.cases {
      let lifecycle = PublicationSessionLifecycle()
      for (index, step) in testCase.steps.enumerated() {
        guard let state = PublicationSessionLifecycleState(rawValue: step.state) else {
          throw HarnessError("Unknown publication-session state \(step.state)")
        }
        try expect(
          lifecycle.transition(to: state) == step.accepted,
          "\(testCase.name) step \(index)"
        )
      }
    }

    let readerAPIContract = try JSONDecoder().decode(
      ReaderAPIContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[3]))
    )
    try expect(readerAPIContract.version == 1, "Unexpected reader-API contract version")
    try expect(
      readerAPIContract.locationThrottleMilliseconds
        == ReaderEventProtocol.locationThrottleMilliseconds,
      "Reader location throttle parity"
    )
    for testCase in readerAPIContract.commandCases {
      guard let state = StableReaderState(rawValue: testCase.state) else {
        throw HarnessError("Unknown stable reader state \(testCase.state)")
      }
      try expect(
        ReaderEventProtocol.commandErrorCode(state: state, destroyed: testCase.destroyed)?.rawValue
          == testCase.errorCode,
        "Command readiness \(testCase.state)"
      )
    }
    for testCase in readerAPIContract.eventCases {
      let eventProtocol = ReaderEventProtocol()
      for (index, step) in testCase.steps.enumerated() {
        let sequence: Int?
        if step.kind == "event" {
          sequence = eventProtocol.nextEvent(generation: step.generation)
        } else if step.kind == "location" {
          guard
            let reasonValue = step.reason,
            let reason = StableReaderLocationReason(rawValue: reasonValue),
            let timestamp = step.timestampMilliseconds
          else {
            throw HarnessError("Invalid reader location step")
          }
          sequence = eventProtocol.nextLocation(
            generation: step.generation,
            reason: reason,
            timestampMilliseconds: timestamp
          )
        } else {
          throw HarnessError("Unknown reader event step \(step.kind)")
        }
        try expect((sequence != nil) == step.accepted, "\(testCase.name) step \(index) accepted")
        try expect(sequence == step.sequence, "\(testCase.name) step \(index) sequence")
      }
    }

    let publicationDataContract = try JSONDecoder().decode(
      PublicationDataContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[4]))
    )
    try expect(publicationDataContract.version == 1, "Unexpected publication-data version")
    try expect(
      PublicationDataPolicy.defaultPositionPageSize
        == publicationDataContract.defaultPositionPageSize,
      "Default position page size"
    )
    try expect(
      PublicationDataPolicy.maximumPositionPageSize
        == publicationDataContract.maximumPositionPageSize,
      "Maximum position page size"
    )
    for testCase in publicationDataContract.pageCases {
      let bounds = PublicationDataPolicy.positionPageBounds(
        total: testCase.total,
        requestedOffset: testCase.offset,
        requestedLimit: testCase.limit
      )
      try expect(bounds.offset == testCase.expectedOffset, "\(testCase.name) offset")
      try expect(bounds.count == testCase.expectedCount, "\(testCase.name) count")
      try expect(bounds.nextOffset == testCase.expectedNextOffset, "\(testCase.name) next")
    }
    for testCase in publicationDataContract.tocCases {
      try expect(
        PublicationDataPolicy.warnings(
          tableOfContents: testCase.tableOfContents,
          readingOrderHrefs: testCase.readingOrderHrefs,
          positionCount: testCase.positionCount,
          fixedLayout: testCase.fixedLayout
        ) == testCase.expectedWarnings,
        "\(testCase.name) warnings"
      )
    }

    let navigationContract = try JSONDecoder().decode(
      NavigationContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[5]))
    )
    try expect(navigationContract.version == 1, "Unexpected navigation contract version")
    try expect(
      navigationContract.maximumBridgePosition == NavigationPolicy.maximumBridgePosition,
      "Maximum bridge position"
    )
    for testCase in navigationContract.progressionCases {
      try expect(
        NavigationPolicy.progressionIsValid(testCase.value) == testCase.valid,
        "\(testCase.name) progression validity"
      )
    }
    for testCase in navigationContract.positionCases {
      try expect(
        NavigationPolicy.positionIsValid(testCase.value) == testCase.valid,
        "\(testCase.name) position validity"
      )
    }
    for testCase in navigationContract.outcomeCases {
      guard let command = NavigationCommandKind(rawValue: testCase.command) else {
        throw HarnessError("Unknown navigation command \(testCase.command)")
      }
      try expect(
        NavigationPolicy.outcome(command: command, moved: testCase.moved).wireValue
          == testCase.expected,
        "\(testCase.name) navigation outcome"
      )
    }
    for testCase in navigationContract.restoreReasonCases {
      try expect(
        NavigationPolicy.initialLocationReason(
          hasLocator: testCase.hasLocator,
          preferenceChange: testCase.preferenceChange
        ).rawValue == testCase.expected,
        "\(testCase.name) restore reason"
      )
    }

    let preferencesContract = try JSONDecoder().decode(
      PreferencesContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[6]))
    )
    try expect(preferencesContract.version == 1, "Unexpected preferences contract version")
    let decodedDefaultPreferences = try ResolvedReaderPreferences(
      validating: preferencesContract.defaults
    )
    try expect(
      decodedDefaultPreferences == .defaults,
      "Default preferences"
    )
    try expect(
      preferencesContract.ranges["fontSize"]?.minimum
        == ReaderPreferencesPolicy.fontSizeRange.lowerBound
        && preferencesContract.ranges["fontSize"]?.maximum
          == ReaderPreferencesPolicy.fontSizeRange.upperBound,
      "Font-size range"
    )
    try expect(
      preferencesContract.ranges["pageMargins"]?.minimum
        == ReaderPreferencesPolicy.pageMarginsRange.lowerBound
        && preferencesContract.ranges["pageMargins"]?.maximum
          == ReaderPreferencesPolicy.pageMarginsRange.upperBound,
      "Page-margin range"
    )
    try expect(
      preferencesContract.ranges["lineHeight"]?.minimum
        == ReaderPreferencesPolicy.lineHeightRange.lowerBound
        && preferencesContract.ranges["lineHeight"]?.maximum
          == ReaderPreferencesPolicy.lineHeightRange.upperBound,
      "Line-height range"
    )
    guard
      case let .object(defaultPreferenceObject) = preferencesContract.defaults
    else {
      throw HarnessError("Preferences defaults must be an object")
    }
    for testCase in preferencesContract.normalizationCases {
      let result = Result { try ResolvedReaderPreferences(validating: testCase.input) }
      try expect(
        ((try? result.get()) != nil) == testCase.valid,
        "\(testCase.name) preference validity"
      )
      if testCase.valid, case let .object(input) = testCase.input {
        let actual = try result.get()
        let expected = try ResolvedReaderPreferences(
          validating: .object(defaultPreferenceObject.merging(input) { _, new in new })
        )
        try expect(actual == expected, "\(testCase.name) normalized preferences")
      }
    }
    for testCase in preferencesContract.policyCases {
      let preferences = try ResolvedReaderPreferences(validating: testCase.preferences)
      let policy = ReaderPreferencesPolicy.resolve(
        preferences,
        fixedLayout: testCase.layout == "fixed"
      )
      try expect(
        policy.appliedNames.map(\.rawValue) == testCase.applied,
        "\(testCase.name) applied preferences"
      )
      try expect(
        Dictionary(uniqueKeysWithValues: policy.support.compactMap { item in
          item.supported ? nil : item.reason.map { (item.name.rawValue, $0) }
        }) == testCase.unsupported,
        "\(testCase.name) unsupported preferences"
      )
      try expect(policy.warnings == testCase.warnings, "\(testCase.name) preference warnings")
    }

    let navigationPolicyContract = try JSONDecoder().decode(
      NavigationPolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[7]))
    )
    try expect(navigationPolicyContract.version == 1, "Unexpected navigation-policy contract")
    let defaultNavigationPolicy = try ResolvedReaderNavigationPolicy(
      validating: navigationPolicyContract.defaults
    )
    try expect(
      NSDictionary(dictionary: defaultNavigationPolicy.foundationObject).isEqual(
        to: ResolvedReaderNavigationPolicy.defaults.foundationObject
      ),
      "Default navigation policy"
    )
    let liveNavigationPolicy = try ResolvedReaderNavigationPolicy(
      validating: .object(["edgeTapNavigation": .boolean(true)])
    )
    try expect(
      !ReaderNavigationPolicy.requiresNavigatorRecreation(
        previous: defaultNavigationPolicy,
        next: liveNavigationPolicy
      ),
      "Edge taps update live"
    )
    let recreatedNavigationPolicy = try ResolvedReaderNavigationPolicy(
      validating: .object(["chapterTurnGesture": .string("enabled")])
    )
    try expect(
      ReaderNavigationPolicy.requiresNavigatorRecreation(
        previous: defaultNavigationPolicy,
        next: recreatedNavigationPolicy
      ),
      "Chapter gestures recreate the navigator"
    )
    try expect(
      ReaderNavigationPolicy.rejectsUserMovement(
        policy: defaultNavigationPolicy,
        effectiveLayout: "scrolled",
        resourceChanged: true
      ),
      "Default chapter transition rejection"
    )
    try expect(
      !ReaderNavigationPolicy.rejectsUserMovement(
        policy: recreatedNavigationPolicy,
        effectiveLayout: "paginated",
        resourceChanged: true
      ),
      "Enabled chapter transition"
    )
    let navigationPolicyStatus = ReaderNavigationPolicy.statusPayload(
      policy: defaultNavigationPolicy,
      application: "initial",
      effectiveLayout: "scrolled",
      readingProgression: "rtl",
      instanceId: "reader",
      generation: 4
    )
    try expect(
      navigationPolicyStatus["boundaryGranularity"] as? String == "reading-order-resource",
      "Navigation resource boundary status"
    )

    let navigationBoundariesContract = try JSONDecoder().decode(
      NavigationBoundariesContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[8]))
    )
    try expect(
      navigationBoundariesContract.version == 1,
      "Unexpected navigation-boundaries contract"
    )
    try expect(
      navigationBoundariesContract.maximumHistoryEntries == 64,
      "Navigation history bound"
    )
    for testCase in navigationBoundariesContract.boundaryCases {
      let configuration = try ReaderNavigationUnitBoundaryConfiguration(
        generation: 4,
        instanceId: "boundary-reader",
        precision: testCase.precision,
        units: navigationBoundariesContract.units
      )
      let match = NavigationUnitBoundaryPolicy.match(
        configuration: configuration,
        location: testCase.location,
        preferredUnitId: testCase.preferredUnitId
      )
      try expect(match?.unit.id == testCase.expected.unitId, "\(testCase.name) unit")
      try expect(match?.precision == testCase.expected.precision, "\(testCase.name) precision")
    }

    let diagnosticsContract = try JSONDecoder().decode(
      DiagnosticsContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[9]))
    )
    try expect(diagnosticsContract.version == 1, "Unexpected diagnostics contract version")
    try expect(
      diagnosticsContract.schemaVersion == ReaderDiagnosticsPolicy.schemaVersion,
      "Diagnostics schema parity"
    )
    try expect(
      diagnosticsContract.featureNames == ReaderDiagnosticsPolicy.featureNames,
      "Diagnostics feature parity"
    )
    try expect(
      diagnosticsContract.limits.maximumWarnings == ReaderDiagnosticsPolicy.maximumWarnings,
      "Diagnostics warning bound parity"
    )
    for testCase in diagnosticsContract.cases {
      let preferences = try ResolvedReaderPreferences(validating: testCase.preferences)
      let preferencesStatus = ReaderPreferencesPolicy.statusPayload(
        preferences: preferences,
        fixedLayout: testCase.publication.layout == "fixed",
        instanceId: "must-not-escape",
        generation: 7
      )
      let payload = ReaderDiagnosticsPolicy.payload(
        platform: testCase.platform,
        sdkVersion: diagnosticsContract.sdk.version,
        toolkitName: testCase.toolkit.name,
        toolkitVersion: testCase.toolkit.version,
        toolkitRevision: testCase.toolkit.revision,
        generation: 7,
        publication: ReaderDiagnosticsPublicationInput(
          layout: testCase.publication.layout,
          readingProgression: testCase.publication.readingProgression,
          positionCount: testCase.publication.positionCount,
          progressPrecision: testCase.publication.progressPrecision,
          mappingDurationMilliseconds: testCase.publication.mappingDurationMilliseconds,
          capabilities: testCase.publication.capabilities,
          warnings: testCase.publication.warnings
        ),
        fonts: ReaderFontManifestDiagnostics(
          status: testCase.fonts.status,
          faceCount: testCase.fonts.faceCount,
          familyCount: testCase.fonts.familyCount
        ),
        preferencesStatus: preferencesStatus
      )
      guard let features = payload["features"] as? [[String: Any]] else {
        throw HarnessError("\(testCase.name) features payload")
      }
      try expect(
        features.compactMap { feature in
          feature["enabled"] as? Bool == true ? feature["name"] as? String : nil
        } == testCase.expected.enabled,
        "\(testCase.name) enabled features"
      )
      try expect(
        Dictionary(uniqueKeysWithValues: features.compactMap { feature -> (String, String)? in
          guard
            let name = feature["name"] as? String,
            let stage = feature["stage"] as? String
          else { return nil }
          return (name, stage)
        }) == testCase.expected.stages,
        "\(testCase.name) feature stages"
      )
      try expect(
        payload["warnings"] as? [String] == testCase.expected.warnings,
        "\(testCase.name) aggregate warnings"
      )
      let reportData = try JSONSerialization.data(
        withJSONObject: payload,
        options: [.sortedKeys, .prettyPrinted]
      )
      let report = String(decoding: reportData, as: UTF8.self)
      try expect(!report.contains("must-not-escape"), "\(testCase.name) instance redaction")
      for fragment in diagnosticsContract.redaction.forbiddenFragments {
        try expect(!report.contains(fragment), "\(testCase.name) forbidden fragment \(fragment)")
      }
      try expect(
        Set(diagnosticKeys(in: payload)).isDisjoint(with: diagnosticsContract.redaction.forbiddenKeys),
        "\(testCase.name) forbidden diagnostic keys"
      )
    }

    let fontManifestContract = try JSONDecoder().decode(
      FontManifestContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[10]))
    )
    try expect(fontManifestContract.version == 1, "Unexpected font-manifest contract")
    try expect(
      fontManifestContract.schemaVersion == NativeFontManifestPolicy.schemaVersion,
      "Font-manifest schema parity"
    )
    try expect(
      fontManifestContract.maximumFaces == NativeFontManifestPolicy.maximumFaces,
      "Font-manifest face bound parity"
    )
    for testCase in fontManifestContract.cases {
      let availableFiles = Set(testCase.availableFiles)
      let manifestData = try testCase.manifest.map { try JSONEncoder().encode($0) }
      let result = NativeFontManifestPolicy.validate(
        data: manifestData,
        platform: testCase.platform,
        fileAvailable: availableFiles.contains
      )
      try expect(result.status == testCase.expected.status, "\(testCase.name) status")
      try expect(result.faceCount == testCase.expected.faceCount, "\(testCase.name) faces")
      try expect(result.familyCount == testCase.expected.familyCount, "\(testCase.name) families")
      try expect(
        canonicalFontFamilies(result.families) == canonicalExpectedFontFamilies(testCase.expected),
        "\(testCase.name) grouping"
      )
    }

    let typographyContract = try JSONDecoder().decode(
      TypographyProfileContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[11]))
    )
    try expect(typographyContract.version == 1, "Unexpected typography-profile contract")
    try expect(
      typographyContract.maximumRules == TypographyProfilePolicy.maximumRules,
      "Typography rule bound parity"
    )
    try expect(
      typographyContract.maximumFontFamilies == TypographyProfilePolicy.maximumFontFamilies,
      "Typography family bound parity"
    )
    var validTypographyProfiles: [String: ResolvedTypographyProfile] = [:]
    for testCase in typographyContract.cases {
      let result = TypographyProfilePolicy.validate(
        testCase.profile,
        availableFontFamilies: Set(testCase.availableFontFamilies)
      )
      try expect(result.status == testCase.expected.status, "\(testCase.name) typography status")
      try expect(
        result.stylesheet == testCase.expected.stylesheet,
        "\(testCase.name) typography stylesheet"
      )
      try expect(
        result.profile.map(typographyProfileJSON) == testCase.expected.profile,
        "\(testCase.name) normalized typography profile"
      )
      if let profile = result.profile { validTypographyProfiles[testCase.name] = profile }
    }

    let footnoteLinkContract = try JSONDecoder().decode(
      FootnoteLinkPolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[12]))
    )
    try expect(footnoteLinkContract.version == 1, "Unexpected footnote/link contract")
    try expect(
      footnoteLinkContract.maximumHeuristicRules == FootnoteLinkPolicy.maximumHeuristicRules,
      "Footnote heuristic bound parity"
    )
    try expect(
      footnoteLinkContract.maximumExternalSchemes == FootnoteLinkPolicy.maximumExternalSchemes,
      "External scheme bound parity"
    )
    for testCase in footnoteLinkContract.footnoteCases {
      do {
        let policy = try FootnoteLinkPolicy.resolveFootnote(try foundationJSON(testCase.policy))
        let decision = FootnoteLinkPolicy.decideInternal(
          policy: policy,
          href: testCase.href,
          semantic: testCase.semantic
        )
        try expect(testCase.expectedError != true, "\(testCase.name) expected error")
        let normalizedPolicy = try sharedJSON(policy.jsonObject)
        let normalizedDecision = try sharedJSON(decision.jsonObject)
        try expect(
          normalizedPolicy == testCase.expectedPolicy,
          "\(testCase.name) footnote policy"
        )
        try expect(
          normalizedDecision == testCase.expectedDecision,
          "\(testCase.name) footnote decision"
        )
      } catch {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected error \(error)")
      }
    }
    for testCase in footnoteLinkContract.linkCases {
      do {
        let policy = try FootnoteLinkPolicy.resolveLinks(try foundationJSON(testCase.policy))
        let decision = FootnoteLinkPolicy.decideExternal(policy: policy, href: testCase.href)
        try expect(testCase.expectedError != true, "\(testCase.name) expected error")
        let normalizedPolicy = try sharedJSON(policy.jsonObject)
        let normalizedDecision = try sharedJSON(decision.jsonObject)
        try expect(
          normalizedPolicy == testCase.expectedPolicy,
          "\(testCase.name) link policy"
        )
        try expect(
          normalizedDecision == testCase.expectedDecision,
          "\(testCase.name) link decision"
        )
      } catch {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected error \(error)")
      }
    }

    let selectionActionContract = try JSONDecoder().decode(
      SelectionActionPolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[13]))
    )
    try expect(selectionActionContract.version == 1, "Unexpected selection-action contract")
    try expect(
      selectionActionContract.maximumActions == SelectionActionPolicy.maximumActions,
      "Selection action count bound parity"
    )
    try expect(
      selectionActionContract.maximumActionIdUtf16Units
        == SelectionActionPolicy.maximumActionIdUTF16Units,
      "Selection action ID bound parity"
    )
    try expect(
      selectionActionContract.maximumActionTitleUtf16Units
        == SelectionActionPolicy.maximumActionTitleUTF16Units,
      "Selection action title bound parity"
    )
    try expect(
      selectionActionContract.maximumSelectionTextUtf16Units
        == SelectionActionPolicy.maximumSelectionTextUTF16Units,
      "Selection text bound parity"
    )
    try expect(
      selectionActionContract.maximumSelectionContextUtf16Units
        == SelectionActionPolicy.maximumSelectionContextUTF16Units,
      "Selection context bound parity"
    )
    for testCase in selectionActionContract.actionCases {
      do {
        let actions = try SelectionActionPolicy.resolve(try foundationJSON(testCase.actions))
        try expect(testCase.expectedError != true, "\(testCase.name) expected error")
        let normalizedActions = try sharedJSON(actions.map(\.jsonObject))
        try expect(
          normalizedActions == testCase.expected,
          "\(testCase.name) normalized selection actions"
        )
      } catch is SelectionActionPolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected error")
      }
    }
    for testCase in selectionActionContract.directionCases {
      try expect(
        SelectionActionPolicy.textDirection(testCase.text) == testCase.expected,
        "\(testCase.name) selection direction"
      )
    }
    try expect(
      SelectionTextBounder.bound("مطالعہ", maximumUTF16Units: 8)
        == BoundedSelectionText(text: "مطالعہ", truncated: false),
      "Selection text within bound"
    )
    try expect(
      SelectionTextBounder.bound("abcde\u{0301}", maximumUTF16Units: 5)
        == BoundedSelectionText(text: "abcd", truncated: true),
      "Selection prefix combining grapheme bound"
    )
    try expect(
      SelectionTextBounder.bound("abcd📖", maximumUTF16Units: 5)
        == BoundedSelectionText(text: "abcd", truncated: true),
      "Selection prefix surrogate bound"
    )
    try expect(
      SelectionTextBounder.boundEnd("📖abcde\u{0301}", maximumUTF16Units: 5)
        == BoundedSelectionText(text: "bcde\u{0301}", truncated: true),
      "Selection suffix grapheme bound"
    )
    try expect(
      SelectionTextBounder.bound("📖", maximumUTF16Units: 0)
        == BoundedSelectionText(text: "", truncated: true),
      "Selection zero bound"
    )

    let decorationContract = try JSONDecoder().decode(
      DecorationPolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[14]))
    )
    try expect(decorationContract.version == 1, "Unexpected decoration-policy contract")
    try expect(
      decorationContract.maximumGroups == DecorationPolicy.maximumGroups,
      "Decoration group count bound parity"
    )
    try expect(
      decorationContract.maximumDecorationsPerGroup
        == DecorationPolicy.maximumDecorationsPerGroup,
      "Decoration count bound parity"
    )
    try expect(
      decorationContract.maximumChanges == DecorationPolicy.maximumChanges,
      "Decoration change count bound parity"
    )
    try expect(
      decorationContract.maximumGroupUtf16Units == DecorationPolicy.maximumGroupUTF16Units,
      "Decoration group identifier bound parity"
    )
    try expect(
      decorationContract.maximumIdUtf16Units == DecorationPolicy.maximumIdUTF16Units,
      "Decoration identifier bound parity"
    )
    try expect(
      decorationContract.maximumDataUtf8Bytes == DecorationPolicy.maximumDataUTF8Bytes,
      "Decoration data bound parity"
    )
    for testCase in decorationContract.groupCases {
      do {
        let result = try DecorationPolicy.resolveDecorations(group: testCase.input, values: [])
        try expect(testCase.expectedError != true, "\(testCase.name) expected group error")
        try expect(result.group == testCase.expected, "\(testCase.name) normalized group")
      } catch is DecorationPolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected group error")
      }
    }

    let baseDecorationLocator = try foundationJSON(decorationContract.baseLocator)!
    func expandedDecoration(_ shape: DecorationShape) throws -> [String: Any] {
      [
        "id": shape.id,
        "locator": baseDecorationLocator,
        "style": try foundationJSON(shape.style)!,
      ]
    }
    for testCase in decorationContract.styleCases {
      do {
        let result = try DecorationPolicy.resolveDecoration([
          "id": "contract-style",
          "locator": baseDecorationLocator,
          "style": try foundationJSON(testCase.input)!,
        ])
        try expect(testCase.expectedError != true, "\(testCase.name) expected style error")
        let normalizedStyle = try sharedJSON(result.style.jsonObject)
        try expect(
          normalizedStyle == testCase.expected,
          "\(testCase.name) normalized style"
        )
      } catch is DecorationPolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected style error")
      }
    }
    for testCase in decorationContract.deltaCases {
      do {
        let initial = try testCase.initial.map {
          try DecorationPolicy.resolveDecoration(expandedDecoration($0))
        }
        let changes: [[String: Any]] = try testCase.changes.map { change in
          if change.type == "remove" {
            return ["type": change.type, "id": change.id as Any]
          }
          return [
            "type": change.type,
            "decoration": try expandedDecoration(change.decoration!),
          ]
        }
        let resolvedChanges = try DecorationPolicy.resolveChanges(
          group: "annotations",
          values: changes
        ).changes
        let result = try DecorationPolicy.applyChanges(current: initial, changes: resolvedChanges)
        try expect(testCase.expectedError != true, "\(testCase.name) expected delta error")
        let actual: SharedJSONValue = .array(result.map {
          .object([
            "id": .string($0.id),
            "style": DecorationPolicy.sharedJSONValue($0.style.jsonObject),
          ])
        })
        let expected: SharedJSONValue? = testCase.expected.map { expected in
          .array(expected.map { .object(["id": .string($0.id), "style": $0.style]) })
        }
        try expect(actual == expected, "\(testCase.name) resulting decoration state")
      } catch is DecorationPolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected delta error")
      }
    }

    let imagePolicyContract = try JSONDecoder().decode(
      ImagePolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[15]))
    )
    try expect(imagePolicyContract.version == 1, "Unexpected image-policy contract")
    let defaultImagePolicyJSON = try sharedJSON(ReaderImagePolicy.default.jsonObject)
    try expect(
      defaultImagePolicyJSON == imagePolicyContract.defaults,
      "Image policy defaults"
    )
    for testCase in imagePolicyContract.cases {
      do {
        let policy = try ReaderImagePolicy.resolve(try foundationJSON(testCase.policy))
        try expect(testCase.expectedError != true, "\(testCase.name) expected image-policy error")
        let resolvedImagePolicyJSON = try sharedJSON(policy.jsonObject)
        try expect(
          resolvedImagePolicyJSON == testCase.expected,
          "\(testCase.name) resolved image policy"
        )
        if let uses = testCase.uses {
          try expect(
            ReaderImagePolicy.allows(.zoom, policy: policy) == uses["zoom"],
            "\(testCase.name) zoom policy"
          )
          try expect(
            ReaderImagePolicy.allows(.share, policy: policy) == uses["share"],
            "\(testCase.name) sharing policy"
          )
        }
      } catch is ReaderImagePolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected image-policy error")
      }
    }
    let validImageSourceHandle = try ReaderImagePolicy.validateSourceHandle("opaque")
    try expect(validImageSourceHandle == "opaque", "Image source handle")
    do {
      _ = try ReaderImagePolicy.validateSourceHandle("")
      throw HarnessError("Empty image source handle accepted")
    } catch is ReaderImagePolicyError {}

    let searchPolicyContract = try JSONDecoder().decode(
      SearchPolicyContract.self,
      from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[16]))
    )
    try expect(searchPolicyContract.version == 1, "Unexpected search-policy contract")
    let searchBounds = searchPolicyContract.bounds
    try expect(searchBounds.defaultPageSize == ReaderSearchPolicy.defaultPageSize, "Search default page size")
    try expect(searchBounds.maximumPageSize == ReaderSearchPolicy.maximumPageSize, "Search maximum page size")
    try expect(searchBounds.maximumResults == ReaderSearchPolicy.maximumResults, "Search result bound")
    try expect(searchBounds.maximumQueryUtf16Units == ReaderSearchPolicy.maximumQueryUTF16Units, "Search query bound")
    try expect(searchBounds.maximumLanguageUtf16Units == ReaderSearchPolicy.maximumLanguageUTF16Units, "Search language bound")
    try expect(searchBounds.maximumExcerptContextUtf16Units == ReaderSearchPolicy.maximumExcerptContextUTF16Units, "Search excerpt context bound")
    try expect(searchBounds.maximumExcerptHighlightUtf16Units == ReaderSearchPolicy.maximumExcerptHighlightUTF16Units, "Search highlight bound")
    try expect(searchBounds.maximumResourceTitleUtf16Units == ReaderSearchPolicy.maximumResourceTitleUTF16Units, "Search resource-title bound")
    try expect(searchBounds.maximumSessionIdUtf16Units == ReaderSearchPolicy.maximumSessionIdUTF16Units, "Search session-ID bound")
    try expect(searchBounds.maximumCursorUtf16Units == ReaderSearchPolicy.maximumCursorUTF16Units, "Search cursor bound")
    let defaultSearchOptionsJSON = try sharedJSON(ReaderSearchPolicy.defaultOptions.jsonObject)
    try expect(defaultSearchOptionsJSON == searchPolicyContract.defaults, "Search option defaults")
    let searchDecorationGroupsJSON = try sharedJSON(ReaderSearchPolicy.decorationGroups)
    try expect(
      searchDecorationGroupsJSON == searchPolicyContract.decorationGroups,
      "Search decoration groups"
    )
    func expanded(_ value: String?, _ repeatValue: SearchRepeatValue?) -> String {
      if let repeatValue { return String(repeating: repeatValue.value, count: repeatValue.count) }
      return value ?? ""
    }
    for testCase in searchPolicyContract.requestCases {
      do {
        let request = try ReaderSearchPolicy.resolve(
          query: expanded(testCase.query, testCase.queryRepeat),
          options: try foundationJSON(testCase.options)
        )
        try expect(testCase.expectedError != true, "\(testCase.name) expected search error")
        let requestJSON = try sharedJSON(request.jsonObject)
        try expect(requestJSON == testCase.expected, "\(testCase.name) normalized search request")
      } catch is ReaderSearchPolicyError {
        try expect(testCase.expectedError == true, "\(testCase.name) unexpected search error")
      }
    }
    for testCase in searchPolicyContract.excerptCases {
      let excerpt = ReaderSearchPolicy.excerpt(
        before: expanded(testCase.before, testCase.beforeRepeat),
        highlight: testCase.highlight,
        after: expanded(testCase.after, testCase.afterRepeat)
      )
      if let expected = testCase.expected {
        let excerptJSON = try sharedJSON(excerpt.jsonObject)
        try expect(excerptJSON == expected, "\(testCase.name) search excerpt")
      }
      if let lengths = testCase.expectedLengths {
        try expect(excerpt.before.utf16.count == lengths.before, "\(testCase.name) before length")
        try expect(excerpt.highlight.utf16.count == lengths.highlight, "\(testCase.name) highlight length")
        try expect(excerpt.after.utf16.count == lengths.after, "\(testCase.name) after length")
      }
      if let expectedTruncated = testCase.expectedTruncated {
        try expect(excerpt.truncated == expectedTruncated, "\(testCase.name) excerpt truncation")
      }
    }
    let validSearchSessionId = try ReaderSearchPolicy.validateSessionId("session-1")
    try expect(validSearchSessionId == "session-1", "Search session ID")
    let initialSearchCursor = try ReaderSearchPolicy.validateCursor("", allowInitialEmpty: true)
    try expect(initialSearchCursor.isEmpty, "Initial search cursor")
    do {
      _ = try ReaderSearchPolicy.validateCursor("bad cursor")
      throw HarnessError("Invalid search cursor accepted")
    } catch is ReaderSearchPolicyError {}

    let ledger = PublicationSessionResourceLedger()
    for index in 0 ..< 20 {
      let id = "session-\(index)"
      ledger.register(id)
      ledger.update(
        id,
        state: .retrieving,
        ownsAsset: true,
        ownsPublication: false,
        ownsSourceLease: false
      )
      ledger.update(
        id,
        state: .ready,
        ownsAsset: false,
        ownsPublication: true,
        ownsSourceLease: false
      )
      ledger.update(
        id,
        state: .closed,
        ownsAsset: false,
        ownsPublication: false,
        ownsSourceLease: false
      )
      ledger.unregister(id, residentMemoryBytes: 100_000_000 + Int64(index * 64_000))
    }
    let resourceSnapshot = ledger.snapshot()
    try expect(resourceSnapshot.activeSessions == 0, "No active sessions after 20 cycles")
    try expect(resourceSnapshot.ownedAssets == 0, "No assets after 20 cycles")
    try expect(resourceSnapshot.ownedPublications == 0, "No publications after 20 cycles")
    try expect(resourceSnapshot.completedSessions == 20, "Twenty completed sessions")
    try expect(resourceSnapshot.forcedReleaseViolations == 0, "No forced release")
    try expect(resourceSnapshot.maximumActiveSessions == 1, "One-session high water")
    try expect(resourceSnapshot.maximumOwnedAssets == 1, "One-asset high water")
    try expect(resourceSnapshot.maximumOwnedPublications == 1, "One-publication high water")
    try expect(resourceSnapshot.postWarmupMemoryIsBounded == true, "Bounded synthetic trend")

    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("native-epub-kit-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }

    let readable = directory.appendingPathComponent("readable.epub")
    try Data("qualification".utf8).write(to: readable)
    try expect(
      (try? PublicationSourceResolver.resolveLegacyUri(readable.absoluteString).get()) != nil,
      "readable"
    )

    let missing = directory.appendingPathComponent("missing.epub")
    try expect(
      sourceFailure(missing.absoluteString)?.code == "SOURCE_NOT_FOUND",
      "missing"
    )

    let unsupported = directory.appendingPathComponent("unsupported.txt")
    try Data("qualification".utf8).write(to: unsupported)
    try expect(
      sourceFailure(unsupported.absoluteString)?.code == "UNSUPPORTED_FORMAT",
      "unsupported"
    )
    try expect(
      sourceFailure("https://example.invalid/book.epub")?.code == "UNSUPPORTED_FORMAT",
      "remote"
    )
    try expect(
      sourceFailure("content://example.invalid/book.epub")?.code == "UNSUPPORTED_FORMAT",
      "content URI on Apple platform"
    )
    let fileRecord = try SharedPublicationSourceRecord(
      validating: .object([
        "kind": .string("file"),
        "uri": .string(readable.absoluteString),
      ])
    )
    let resolvedFileRecord = try PublicationSourceResolver.resolve(fileRecord).get()
    try expect(resolvedFileRecord.kind == .file, "stable file source record")
    let remoteRecord = try SharedPublicationSourceRecord(
      validating: .object([
        "kind": .string("remote"),
        "url": .string("https://example.invalid/book.epub"),
      ])
    )
    if case let .failure(error) = PublicationSourceResolver.resolve(remoteRecord) {
      try expect(error.code == "UNSUPPORTED_FORMAT", "stable remote source record")
    } else {
      throw HarnessError("Remote source record unexpectedly resolved")
    }

    let unreadable = directory.appendingPathComponent("unreadable.epub")
    try Data("qualification".utf8).write(to: unreadable)
    try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: unreadable.path)
    if !FileManager.default.isReadableFile(atPath: unreadable.path) {
      try expect(
        sourceFailure(unreadable.absoluteString)?.code == "SOURCE_PERMISSION_DENIED",
        "unreadable"
      )
    }

    let html = "<html><head><title>Fixture</title></head><body><p>Text</p></body></html>"
    let preserveProfile = try required(
      validTypographyProfiles["preserve-retains-configuration-without-injection"],
      "preserve profile"
    )
    try expect(
      TypographyStyleInjector.inject(html, profile: preserveProfile) == html,
      "preserve typography"
    )
    let hybridProfile = try required(
      validTypographyProfiles["hybrid-mixed-script-rules"],
      "hybrid profile"
    )
    let hybrid = TypographyStyleInjector.inject(html, profile: hybridProfile)
    try expect(hybrid.contains("\(TypographyStyleInjector.marker)=\"hybrid\""), "marker")
    try expect(hybrid.contains(":lang(ur-pk)"), "normalized language rule")
    try expect(hybrid.contains(":dir(ltr)"), "direction rule")
    try expect(hybrid.contains(".quranic"), "consumer class rule")
    try expect(!hybrid.contains("<script"), "no script injection")
    try expect(
      TypographyStyleInjector.inject(hybrid, profile: hybridProfile) == hybrid,
      "idempotent typography"
    )
    try expect(TypographyStyleInjector.supports(path: "text/chapter.xhtml"), "XHTML")
    try expect(!TypographyStyleInjector.supports(path: "images/cover.svg"), "non-HTML")

    let mixed = "قُرْآن Urdu اُردُو English 👩🏽‍💻"
    let utf8HTML =
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><html><head></head><body>\(mixed)</body></html>"
    let utf16HTML =
      "<?xml version=\"1.0\" encoding=\"UTF-16\"?><html><head></head><body>\(mixed)</body></html>"
    let encodedDocuments: [(String.Encoding, [UInt8], String)] = [
      (.utf8, [0xEF, 0xBB, 0xBF], utf8HTML),
      (.utf16LittleEndian, [0xFF, 0xFE], utf16HTML),
      (.utf16BigEndian, [0xFE, 0xFF], utf16HTML),
    ]
    for (encoding, bom, markup) in encodedDocuments {
      var input = Data(bom)
      input.append(try required(markup.data(using: encoding), "encoded typography fixture"))
      let result = TypographyDocumentCodec.inject(input, profile: hybridProfile)
      try expect(result.status == "injected", "supported document injection")
      try expect(result.data.starts(with: bom), "document BOM preservation")
      let decoded = try required(
        String(data: result.data.dropFirst(bom.count), encoding: encoding),
        "decoded typography fixture"
      )
      try expect(decoded.contains(mixed), "mixed-script grapheme preservation")
      try expect(decoded.contains(TypographyStyleInjector.marker), "encoded style injection")
      let repeated = TypographyDocumentCodec.inject(result.data, profile: hybridProfile)
      try expect(repeated.status == "already-injected", "encoded idempotency")
      try expect(repeated.data == result.data, "encoded byte stability")
    }
    let unsupportedDocument = Data(
      "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><html><head></head></html>".utf8
    )
    let unsupportedResult = TypographyDocumentCodec.inject(
      unsupportedDocument,
      profile: hybridProfile
    )
    try expect(unsupportedResult.status == "unsupported-encoding", "unsupported encoding status")
    try expect(
      unsupportedResult.data == unsupportedDocument,
      "unsupported encoding fail-safe"
    )

    print(
      "Swift view/session lifecycle, source, typography, and 20-cycle resource tests passed "
        + "(\(contract.cases.count) view, \(sessionContract.cases.count) session, "
        + "\(readerAPIContract.eventCases.count) reader-API, "
        + "\(publicationDataContract.pageCases.count) paging, "
        + "\(publicationDataContract.tocCases.count) TOC, "
        + "\(navigationContract.outcomeCases.count) navigation outcomes, and "
        + "\(preferencesContract.policyCases.count) preference policy cases, and "
        + "navigation policy, and "
        + "\(diagnosticsContract.cases.count) diagnostics, and "
        + "\(fontManifestContract.cases.count) font-manifest, and "
        + "\(typographyContract.cases.count) typography-profile, and "
        + "\(footnoteLinkContract.footnoteCases.count + footnoteLinkContract.linkCases.count) footnote/link-policy cases)."
    )
  }

  private static func expect(_ condition: @autoclosure () -> Bool, _ context: String) throws {
    if !condition() {
      throw HarnessError("Expectation failed: \(context)")
    }
  }

  private static func required<T>(_ value: T?, _ context: String) throws -> T {
    guard let value else { throw HarnessError("Missing \(context)") }
    return value
  }

  private static func sourceFailure(_ value: String) -> PublicationSessionFailure? {
    if case let .failure(error) = PublicationSourceResolver.resolveLegacyUri(value) {
      return error
    }
    return nil
  }
}

private func canonicalFontFamilies(_ families: [NativeFontFamilyDefinition]) -> [String] {
  families.map { family in
    "\(family.family)|" + family.faces.map { "\($0.file):\($0.style):\($0.weight)" }.joined(separator: ",")
  }
}

private func canonicalExpectedFontFamilies(_ expected: FontManifestExpected) -> [String] {
  expected.families.map { family in
    "\(family.family)|" + family.faces.map { "\($0.file):\($0.style):\($0.weight)" }.joined(separator: ",")
  }
}

private func typographyProfileJSON(_ profile: ResolvedTypographyProfile) -> SharedJSONValue {
  let rules = profile.rules.map { rule -> SharedJSONValue in
    var object: [String: SharedJSONValue] = [
      "target": .object([
        "kind": .string(rule.target.kind),
        "value": .string(rule.target.value),
      ])
    ]
    if let color = rule.color { object["color"] = .string(color) }
    if let fontFamilies = rule.fontFamilies {
      object["fontFamilies"] = .array(fontFamilies.map(SharedJSONValue.string))
    }
    if let direction = rule.direction { object["direction"] = .string(direction) }
    if let lineHeight = rule.lineHeight { object["lineHeight"] = .number(lineHeight) }
    if let fontWeight = rule.fontWeight {
      object["fontWeight"] = .integer(Int64(fontWeight))
    }
    return .object(object)
  }
  var object: [String: SharedJSONValue] = [
    "publisherStyles": .string(profile.publisherStyles.rawValue),
    "defaultFontFamilies": .array(profile.defaultFontFamilies.map(SharedJSONValue.string)),
    "rules": .array(rules),
  ]
  if let colors = profile.colors {
    object["colors"] = .object([
      "background": .string(colors.background),
      "link": .string(colors.link),
      "text": .string(colors.text),
    ])
  }
  return .object(object)
}

private func sharedJSON(_ value: Any) throws -> SharedJSONValue {
  try JSONDecoder().decode(
    SharedJSONValue.self,
    from: JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  )
}

private func foundationJSON(_ value: SharedJSONValue?) throws -> Any? {
  guard let value else { return nil }
  return try JSONSerialization.jsonObject(
    with: JSONEncoder().encode(value),
    options: [.fragmentsAllowed]
  )
}

private func diagnosticKeys(in value: Any) -> [String] {
  if let object = value as? [String: Any] {
    return object.flatMap { key, child in [key] + diagnosticKeys(in: child) }
  }
  if let array = value as? [Any] {
    return array.flatMap(diagnosticKeys)
  }
  return []
}

private struct HarnessError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }
}
