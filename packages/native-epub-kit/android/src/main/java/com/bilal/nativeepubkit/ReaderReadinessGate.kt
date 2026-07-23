package com.bilal.nativeepubkit

/**
 * Holds the native reader in `opening` until both publication metadata and the
 * first visible Readium page are ready.
 *
 * Readium accepts navigation commands before its first page is loaded, but its
 * locator flow intentionally suppresses updates during that window. Exposing
 * `ready` before the viewport is ready can therefore strand the navigator in
 * its loading state when a consumer immediately jumps to another resource.
 */
internal class ReaderReadinessGate {
  private var generation: Long? = null
  private var publicationDataReady = false
  private var viewportReady = false
  private var completed = false

  fun begin(generation: Long) {
    this.generation = generation
    publicationDataReady = false
    viewportReady = false
    completed = false
  }

  fun markPublicationDataReady(generation: Long): Boolean = mark(generation) {
    publicationDataReady = true
  }

  fun markViewportReady(generation: Long): Boolean = mark(generation) {
    viewportReady = true
  }

  fun isWaiting(generation: Long): Boolean =
    this.generation == generation && !completed

  fun reset() {
    generation = null
    publicationDataReady = false
    viewportReady = false
    completed = false
  }

  private inline fun mark(generation: Long, update: () -> Unit): Boolean {
    if (this.generation != generation || completed) return false
    update()
    if (!publicationDataReady || !viewportReady) return false
    completed = true
    return true
  }
}
