package com.bilal.nativeepubkit

/** Compatibility policy for user-activated URI schemes Readium 3.1.2 cannot parse. */
internal object ReaderLinkWebViewPolicy {
  fun shouldIntercept(
    isForMainFrame: Boolean,
    scheme: String?,
  ): Boolean {
    val normalizedScheme = scheme?.lowercase() ?: return false
    return isForMainFrame &&
      normalizedScheme != "http" &&
      normalizedScheme != "https"
  }
}
