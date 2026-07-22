package com.bilal.nativeepubkit

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderLinkWebViewPolicyTest {
  @Test
  fun interceptsCustomSchemesInTheMainFrame() {
    assertTrue(ReaderLinkWebViewPolicy.shouldIntercept(true, "mailto"))
    assertTrue(ReaderLinkWebViewPolicy.shouldIntercept(true, "MYAPP"))
  }

  @Test
  fun leavesHttpReadiumAndSubresourceRequestsToTheToolkit() {
    assertFalse(ReaderLinkWebViewPolicy.shouldIntercept(true, "http"))
    assertFalse(ReaderLinkWebViewPolicy.shouldIntercept(true, "https"))
    assertFalse(ReaderLinkWebViewPolicy.shouldIntercept(false, "mailto"))
    assertFalse(ReaderLinkWebViewPolicy.shouldIntercept(true, null))
  }
}
