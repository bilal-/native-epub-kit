import Foundation

enum PublicationSessionLifecycleState: String, CaseIterable, Sendable {
  case initialized
  case resolving
  case retrieving
  case opening
  case ready
  case failed
  case closing
  case closed
}

final class PublicationSessionLifecycle {
  private(set) var state = PublicationSessionLifecycleState.initialized

  @discardableResult
  func transition(to nextState: PublicationSessionLifecycleState) -> Bool {
    guard
      nextState != state,
      Self.transitions[state, default: []].contains(nextState)
    else {
      return false
    }
    state = nextState
    return true
  }

  private static let transitions: [
    PublicationSessionLifecycleState: Set<PublicationSessionLifecycleState>
  ] = [
    .initialized: [.resolving, .closing],
    .resolving: [.retrieving, .failed, .closing],
    .retrieving: [.opening, .failed, .closing],
    .opening: [.ready, .failed, .closing],
    .ready: [.failed, .closing],
    .failed: [.closing],
    .closing: [.closed],
    .closed: [],
  ]
}

struct PublicationSessionResourceSnapshot: Equatable, Sendable {
  let activeSessions: Int
  let ownedAssets: Int
  let ownedPublications: Int
  let sourceLeases: Int
  let completedSessions: Int
  let forcedReleaseViolations: Int
  let maximumActiveSessions: Int
  let maximumOwnedAssets: Int
  let maximumOwnedPublications: Int
  let maximumSourceLeases: Int
  let memorySamples: [Int64]

  var latestMemoryBytes: Int64? { memorySamples.last }

  var postWarmupGrowthBytes: Int64? {
    guard memorySamples.count > PublicationSessionResourceLedger.warmupSampleCount else {
      return nil
    }
    return memorySamples.last! - memorySamples[PublicationSessionResourceLedger.warmupSampleCount - 1]
  }

  var postWarmupSlopeBytesPerCycle: Int64? {
    let samples = Array(memorySamples.dropFirst(PublicationSessionResourceLedger.warmupSampleCount))
    guard samples.count >= 2 else {
      return nil
    }
    let count = Double(samples.count)
    let meanX = Double(samples.indices.reduce(0, +)) / count
    let meanY = Double(samples.reduce(0, +)) / count
    let numerator = samples.indices.reduce(0.0) { result, index in
      result + (Double(index) - meanX) * (Double(samples[index]) - meanY)
    }
    let denominator = samples.indices.reduce(0.0) { result, index in
      result + pow(Double(index) - meanX, 2)
    }
    guard denominator > 0 else {
      return 0
    }
    return Int64((numerator / denominator).rounded())
  }

  var postWarmupMemoryIsBounded: Bool? {
    guard
      let growth = postWarmupGrowthBytes,
      let slope = postWarmupSlopeBytesPerCycle
    else {
      return nil
    }
    return growth <= PublicationSessionResourceLedger.maximumPostWarmupGrowthBytes
      && slope <= PublicationSessionResourceLedger.maximumPostWarmupSlopeBytesPerCycle
  }
}

final class PublicationSessionResourceLedger: @unchecked Sendable {
  static let warmupSampleCount = 5
  static let maximumPostWarmupGrowthBytes: Int64 = 64 * 1_024 * 1_024
  static let maximumPostWarmupSlopeBytesPerCycle: Int64 = 4 * 1_024 * 1_024

  private struct Entry {
    var state = PublicationSessionLifecycleState.initialized
    var ownsAsset = false
    var ownsPublication = false
    var ownsSourceLease = false
  }

  private let lock = NSLock()
  private var entries: [String: Entry] = [:]
  private var completedSessions = 0
  private var forcedReleaseViolations = 0
  private var maximumActiveSessions = 0
  private var maximumOwnedAssets = 0
  private var maximumOwnedPublications = 0
  private var maximumSourceLeases = 0
  private var memorySamples: [Int64] = []

  func register(_ id: String) {
    lock.withLock {
      precondition(entries[id] == nil, "Publication session registered twice")
      entries[id] = Entry()
      updateHighWatermarks()
    }
  }

  func update(
    _ id: String,
    state: PublicationSessionLifecycleState,
    ownsAsset: Bool,
    ownsPublication: Bool,
    ownsSourceLease: Bool
  ) {
    lock.withLock {
      guard entries[id] != nil else {
        return
      }
      entries[id] = Entry(
        state: state,
        ownsAsset: ownsAsset,
        ownsPublication: ownsPublication,
        ownsSourceLease: ownsSourceLease
      )
      updateHighWatermarks()
    }
  }

  func unregister(_ id: String, residentMemoryBytes: Int64? = nil) {
    lock.withLock {
      guard let entry = entries.removeValue(forKey: id) else {
        return
      }
      if entry.ownsAsset || entry.ownsPublication || entry.ownsSourceLease {
        forcedReleaseViolations += 1
      }
      completedSessions += 1
      if let residentMemoryBytes, residentMemoryBytes >= 0 {
        memorySamples.append(residentMemoryBytes)
      }
    }
  }

  func snapshot() -> PublicationSessionResourceSnapshot {
    lock.withLock {
      PublicationSessionResourceSnapshot(
        activeSessions: entries.count,
        ownedAssets: entries.values.count(where: \.ownsAsset),
        ownedPublications: entries.values.count(where: \.ownsPublication),
        sourceLeases: entries.values.count(where: \.ownsSourceLease),
        completedSessions: completedSessions,
        forcedReleaseViolations: forcedReleaseViolations,
        maximumActiveSessions: maximumActiveSessions,
        maximumOwnedAssets: maximumOwnedAssets,
        maximumOwnedPublications: maximumOwnedPublications,
        maximumSourceLeases: maximumSourceLeases,
        memorySamples: memorySamples
      )
    }
  }

  private func updateHighWatermarks() {
    maximumActiveSessions = max(maximumActiveSessions, entries.count)
    maximumOwnedAssets = max(maximumOwnedAssets, entries.values.count(where: \.ownsAsset))
    maximumOwnedPublications = max(
      maximumOwnedPublications,
      entries.values.count(where: \.ownsPublication)
    )
    maximumSourceLeases = max(
      maximumSourceLeases,
      entries.values.count(where: \.ownsSourceLease)
    )
  }
}

private extension NSLock {
  func withLock<T>(_ body: () throws -> T) rethrows -> T {
    lock()
    defer { unlock() }
    return try body()
  }
}
