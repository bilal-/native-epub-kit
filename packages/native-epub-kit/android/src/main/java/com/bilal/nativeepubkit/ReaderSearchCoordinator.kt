@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.search.SearchIterator
import org.readium.r2.shared.publication.services.search.SearchService
import org.readium.r2.shared.publication.services.search.search
import org.readium.r2.shared.util.Try

internal class ReaderSearchCoordinatorException(
  val reason: Reason,
) : IllegalStateException(reason.name) {
  enum class Reason {
    CANCELLED,
    FAILED,
    INVALID_CURSOR,
    INVALID_SESSION,
    PAGE_IN_FLIGHT,
    UNSUPPORTED,
  }
}

internal data class ReaderSearchSessionSnapshot(
  val generation: Long,
  val id: String,
  val instanceId: String,
  val nextCursor: String,
  val options: ResolvedReaderSearchOptions,
  val query: String,
)

internal data class ReaderSearchIndexedLocator(
  val index: Int,
  val locator: Locator,
)

internal data class ReaderSearchPageSnapshot(
  val complete: Boolean,
  val cursor: String,
  val generation: Long,
  val instanceId: String,
  val loadedResultCount: Int,
  val nextCursor: String?,
  val results: List<ReaderSearchIndexedLocator>,
  val sessionId: String,
  val truncated: Boolean,
)

internal class ReaderSearchCoordinator(
  private val scope: CoroutineScope,
) {
  private sealed interface NextOutcome {
    data class Locators(val value: List<Locator>?) : NextOutcome
    data object Failed : NextOutcome
  }

  private class Session(
    val generation: Long,
    val id: String,
    val instanceId: String,
    val iterator: SearchIterator,
    val options: ResolvedReaderSearchOptions,
    val query: String,
  ) {
    var complete = false
    var deliveredCount = 0
    var nextPageIndex = 0
    var pageInFlight = false
    val pending = mutableListOf<Locator>()
    var truncated = false
  }

  private var operationSerial = 0L
  private var pageJob: Deferred<NextOutcome>? = null
  private var session: Session? = null
  private var startJob: Deferred<SearchIterator?>? = null

  suspend fun start(
    publication: Publication,
    generation: Long,
    instanceId: String,
    request: ResolvedReaderSearchRequest,
  ): ReaderSearchSessionSnapshot {
    cancelAll()
    // Both pinned Readium search engines skip a missing reading-order resource.
    // Rejecting it here prevents a successful but silently incomplete result set.
    val readingOrderAvailable = publication.readingOrder.all { link ->
      val resource = publication.get(link) ?: return@all false
      resource.close()
      true
    }
    if (!readingOrderAvailable) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.FAILED)
    }
    val serial = operationSerial
    val readiumOptions = SearchService.Options(
      caseSensitive = request.options.caseSensitive,
      diacriticSensitive = request.options.diacriticSensitive,
      language = request.options.language,
    )
    val job = scope.async { publication.search(request.query, readiumOptions) }
    startJob = job
    val iterator = try {
      job.await()
    } catch (_: CancellationException) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.CANCELLED)
    } catch (_: Throwable) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.FAILED)
    }
    if (serial != operationSerial) {
      iterator?.close()
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.CANCELLED)
    }
    startJob = null
    if (iterator == null) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.UNSUPPORTED)
    }
    val id = UUID.randomUUID().toString().lowercase()
    val session = Session(
      generation = generation,
      id = id,
      instanceId = instanceId,
      iterator = iterator,
      options = request.options,
      query = request.query,
    )
    this.session = session
    return ReaderSearchSessionSnapshot(
      generation = generation,
      id = id,
      instanceId = instanceId,
      nextCursor = "0",
      options = request.options,
      query = request.query,
    )
  }

  suspend fun page(sessionId: String, suppliedCursor: String): ReaderSearchPageSnapshot {
    val session = session?.takeIf { it.id == sessionId }
      ?: throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.INVALID_SESSION)
    if (session.pageInFlight) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.PAGE_IN_FLIGHT)
    }
    if (session.complete && session.pending.isEmpty()) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.INVALID_CURSOR)
    }
    val cursor = suppliedCursor.ifEmpty { "0" }
    if (cursor != session.nextPageIndex.toString()) {
      throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.INVALID_CURSOR)
    }
    session.pageInFlight = true
    val serial = operationSerial
    try {
      // Deliver available matches before scanning more resources to fill a page.
      while (session.pending.isEmpty() && !session.complete) {
        val job = scope.async {
          when (val result = session.iterator.next()) {
            is Try.Success -> NextOutcome.Locators(result.value?.locators)
            is Try.Failure -> NextOutcome.Failed
          }
        }
        pageJob = job
        val outcome = try {
          job.await()
        } catch (_: CancellationException) {
          throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.CANCELLED)
        }
        if (serial != operationSerial || this.session !== session) {
          throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.CANCELLED)
        }
        pageJob = null
        when (outcome) {
          NextOutcome.Failed -> {
            close(session)
            this.session = null
            throw ReaderSearchCoordinatorException(ReaderSearchCoordinatorException.Reason.FAILED)
          }
          is NextOutcome.Locators -> {
            val locators = outcome.value
            if (locators == null) {
              session.complete = true
              session.iterator.close()
              continue
            }
            val remainingCapacity = (
              ReaderSearchPolicy.MAXIMUM_RESULTS -
                session.deliveredCount -
                session.pending.size
              ).coerceAtLeast(0)
            if (remainingCapacity == 0) {
              session.truncated = true
              session.complete = true
              session.iterator.close()
              continue
            }
            session.pending += locators.take(remainingCapacity)
            if (locators.size >= remainingCapacity) {
              session.truncated = true
              session.complete = true
              session.iterator.close()
            }
          }
        }
      }

      val resultCount = minOf(session.options.pageSize, session.pending.size)
      val pageLocators = session.pending.take(resultCount)
      repeat(resultCount) { session.pending.removeAt(0) }
      val firstIndex = session.deliveredCount
      val results = pageLocators.mapIndexed { offset, locator ->
        ReaderSearchIndexedLocator(index = firstIndex + offset, locator = locator)
      }
      session.deliveredCount += results.size
      val complete = session.complete && session.pending.isEmpty()
      session.nextPageIndex += 1
      val nextCursor = if (complete) null else session.nextPageIndex.toString()
      return ReaderSearchPageSnapshot(
        complete = complete,
        cursor = cursor,
        generation = session.generation,
        instanceId = session.instanceId,
        loadedResultCount = session.deliveredCount,
        nextCursor = nextCursor,
        results = results,
        sessionId = session.id,
        truncated = session.truncated,
      )
    } finally {
      if (this.session === session) session.pageInFlight = false
    }
  }

  fun cancel(sessionId: String) {
    if (session?.id == sessionId) cancelAll()
  }

  fun cancelAll() {
    operationSerial += 1
    startJob?.cancel()
    startJob = null
    pageJob?.cancel()
    pageJob = null
    session?.let(::close)
    session = null
  }

  private fun close(session: Session) {
    session.iterator.close()
    session.pending.clear()
    session.complete = true
  }
}
