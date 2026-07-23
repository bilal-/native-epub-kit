package com.bilal.nativeepubkit

import android.os.Debug

internal object PublicationProcessMemory {
  fun residentBytes(): Long = Debug.getPss().toLong() * 1_024L
}
