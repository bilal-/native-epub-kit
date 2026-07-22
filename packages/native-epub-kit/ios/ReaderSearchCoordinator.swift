import Foundation
import ReadiumShared

enum ReaderSearchCoordinatorError: Error, Equatable {
  case cancelled
  case failed
  case invalidCursor
  case invalidSession
  case pageInFlight
  case unsupported
}

struct ReaderSearchSessionSnapshot: Sendable {
  let generation: Int
  let id: String
  let instanceId: String
  let nextCursor: String
  let options: ResolvedReaderSearchOptions
  let query: String
}

struct ReaderSearchIndexedLocator: Sendable {
  let index: Int
  let locator: Locator
}

struct ReaderSearchPageSnapshot: Sendable {
  let complete: Bool
  let cursor: String
  let generation: Int
  let instanceId: String
  let loadedResultCount: Int
  let nextCursor: String?
  let results: [ReaderSearchIndexedLocator]
  let sessionId: String
  let truncated: Bool
}

@MainActor
final class ReaderSearchCoordinator {
  private enum StartOutcome {
    case iterator(any SearchIterator)
    case unsupported
    case failed
  }

  private enum NextOutcome {
    case locators([Locator]?)
    case failed
  }

  private final class Session {
    let generation: Int
    let id: String
    let instanceId: String
    var iterator: (any SearchIterator)?
    let options: ResolvedReaderSearchOptions
    let query: String
    var complete = false
    var deliveredCount = 0
    var nextPageIndex = 0
    var pageInFlight = false
    var pending: [Locator] = []
    var truncated = false

    init(
      generation: Int,
      id: String,
      instanceId: String,
      iterator: any SearchIterator,
      options: ResolvedReaderSearchOptions,
      query: String
    ) {
      self.generation = generation
      self.id = id
      self.instanceId = instanceId
      self.iterator = iterator
      self.options = options
      self.query = query
    }
  }

  private var operationSerial = 0
  private var pageTask: Task<NextOutcome, Never>?
  private var session: Session?
  private var startTask: Task<StartOutcome, Never>?

  func start(
    publication: Publication,
    generation: Int,
    instanceId: String,
    request: ResolvedReaderSearchRequest
  ) async throws -> ReaderSearchSessionSnapshot {
    cancelAll()
    // Both pinned Readium search engines skip a missing reading-order resource.
    // Rejecting it here prevents a successful but silently incomplete result set.
    guard publication.readingOrder.allSatisfy({ publication.get($0) != nil }) else {
      throw ReaderSearchCoordinatorError.failed
    }
    let serial = operationSerial
    let readiumOptions = SearchOptions(
      caseSensitive: request.options.caseSensitive,
      diacriticSensitive: request.options.diacriticSensitive,
      language: request.options.language.map { Language(code: .bcp47($0)) }
    )
    let task = Task { () -> StartOutcome in
      switch await publication.search(query: request.query, options: readiumOptions) {
      case let .success(iterator): .iterator(iterator)
      case let .failure(error):
        switch error {
        case .publicationNotSearchable: .unsupported
        case .badQuery, .reading: .failed
        }
      }
    }
    startTask = task
    let outcome = await task.value
    guard serial == operationSerial, !Task.isCancelled else {
      throw ReaderSearchCoordinatorError.cancelled
    }
    startTask = nil

    let iterator: any SearchIterator
    switch outcome {
    case let .iterator(value): iterator = value
    case .unsupported: throw ReaderSearchCoordinatorError.unsupported
    case .failed: throw ReaderSearchCoordinatorError.failed
    }
    let id = UUID().uuidString.lowercased()
    let session = Session(
      generation: generation,
      id: id,
      instanceId: instanceId,
      iterator: iterator,
      options: request.options,
      query: request.query
    )
    self.session = session
    return ReaderSearchSessionSnapshot(
      generation: generation,
      id: id,
      instanceId: instanceId,
      nextCursor: "0",
      options: request.options,
      query: request.query
    )
  }

  func page(sessionId: String, cursor suppliedCursor: String) async throws
    -> ReaderSearchPageSnapshot
  {
    guard let session, session.id == sessionId else {
      throw ReaderSearchCoordinatorError.invalidSession
    }
    guard !session.pageInFlight else { throw ReaderSearchCoordinatorError.pageInFlight }
    guard !session.complete || !session.pending.isEmpty else {
      throw ReaderSearchCoordinatorError.invalidCursor
    }
    let cursor = suppliedCursor.isEmpty ? "0" : suppliedCursor
    guard cursor == String(session.nextPageIndex) else {
      throw ReaderSearchCoordinatorError.invalidCursor
    }

    session.pageInFlight = true
    defer {
      if self.session === session { session.pageInFlight = false }
    }
    let serial = operationSerial

    while session.pending.count < session.options.pageSize, !session.complete {
      guard let iterator = session.iterator else {
        close(session)
        self.session = nil
        throw ReaderSearchCoordinatorError.failed
      }
      let task = Task { () -> NextOutcome in
        switch await iterator.next() {
        case let .success(collection): .locators(collection?.locators)
        case .failure: .failed
        }
      }
      pageTask = task
      let outcome = await task.value
      guard
        serial == operationSerial,
        self.session === session,
        !Task.isCancelled
      else {
        throw ReaderSearchCoordinatorError.cancelled
      }
      pageTask = nil

      switch outcome {
      case .failed:
        close(session)
        self.session = nil
        throw ReaderSearchCoordinatorError.failed
      case .locators(nil):
        session.complete = true
        session.iterator = nil
      case let .locators(.some(locators)):
        let remainingCapacity = max(
          0,
          ReaderSearchPolicy.maximumResults - session.deliveredCount - session.pending.count
        )
        if remainingCapacity == 0 {
          session.truncated = true
          session.complete = true
          session.iterator = nil
          continue
        }
        session.pending.append(contentsOf: locators.prefix(remainingCapacity))
        if locators.count >= remainingCapacity {
          session.truncated = true
          session.complete = true
          session.iterator = nil
        }
      }
    }

    let resultCount = min(session.options.pageSize, session.pending.count)
    let pageLocators = Array(session.pending.prefix(resultCount))
    session.pending.removeFirst(resultCount)
    let firstIndex = session.deliveredCount
    let results = pageLocators.enumerated().map {
      ReaderSearchIndexedLocator(index: firstIndex + $0.offset, locator: $0.element)
    }
    session.deliveredCount += results.count
    let complete = session.complete && session.pending.isEmpty
    session.nextPageIndex += 1
    let nextCursor = complete ? nil : String(session.nextPageIndex)
    return ReaderSearchPageSnapshot(
      complete: complete,
      cursor: cursor,
      generation: session.generation,
      instanceId: session.instanceId,
      loadedResultCount: session.deliveredCount,
      nextCursor: nextCursor,
      results: results,
      sessionId: session.id,
      truncated: session.truncated
    )
  }

  func cancel(sessionId: String) {
    guard session?.id == sessionId else { return }
    cancelAll()
  }

  func cancelAll() {
    operationSerial += 1
    startTask?.cancel()
    startTask = nil
    pageTask?.cancel()
    pageTask = nil
    if let session { close(session) }
    session = nil
  }

  private func close(_ session: Session) {
    session.iterator = nil
    session.pending.removeAll(keepingCapacity: false)
    session.complete = true
  }
}
