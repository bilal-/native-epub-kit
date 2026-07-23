package com.bilal.nativeepubkit

import org.readium.r2.shared.publication.Publication

internal object NativeDependencyVersions {
  val NATIVE_EPUB_KIT: String = BuildConfig.NATIVE_EPUB_KIT_VERSION
  val READIUM_KOTLIN: String = BuildConfig.READIUM_KOTLIN_VERSION
  val READIUM_KOTLIN_REVISION: String = BuildConfig.READIUM_KOTLIN_REVISION
  val READIUM_PUBLICATION_CLASS: String = Publication::class.java.name
}
