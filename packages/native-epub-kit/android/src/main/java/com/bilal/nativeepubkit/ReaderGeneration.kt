package com.bilal.nativeepubkit

internal class ReaderGeneration {
  var value: Long = 0
    private set

  fun advance(): Long {
    value += 1
    return value
  }

  fun isCurrent(candidate: Long): Boolean = candidate == value
}
