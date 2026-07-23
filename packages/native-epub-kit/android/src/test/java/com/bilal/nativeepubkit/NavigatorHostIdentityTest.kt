package com.bilal.nativeepubkit

import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigatorHostIdentityTest {
  @Test
  fun remountedViewsCannotReuseAFragmentTagWhenGenerationsRestart() {
    val previous = NavigatorHostIdentity.fragmentTag("instance-a", 0x7f010001, 2)
    val remounted = NavigatorHostIdentity.fragmentTag("instance-b", 0x7f010001, 2)

    assertNotEquals(previous, remounted)
    assertTrue(previous.startsWith("native-epub-kit:"))
    assertTrue(remounted.startsWith("native-epub-kit:"))
  }
}
