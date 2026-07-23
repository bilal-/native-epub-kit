package com.bilal.nativeepubkit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class ReaderOpenRequestTest {
  @Test
  fun decodesSourceAndCanonicalizesItsFingerprint() {
    val withoutLocator = ReaderOpenRequestCodec.decode(
      """{"source":{"kind":"file","uri":"file:///book.epub"}}"""
    )
    assertEquals(SharedPublicationSourceKind.FILE, withoutLocator.source.kind)
    assertNull(withoutLocator.initialLocator)
    assertEquals(ResolvedReaderPreferences.DEFAULTS, withoutLocator.preferences)
    assertEquals(ResolvedReaderNavigationPolicy.DEFAULTS, withoutLocator.navigationPolicy)
    assertEquals(emptyList<ResolvedNativeSelectionAction>(), withoutLocator.selectionActions)

    val reorderedSource = ReaderOpenRequestCodec.decode(
      """{"source":{"uri":"file:///book.epub","kind":"file"}}"""
    )
    assertEquals(withoutLocator.sourceFingerprint, reorderedSource.sourceFingerprint)

    val customPreferences = ReaderOpenRequestCodec.decode(
      """{
        "source":{"kind":"file","uri":"file:///book.epub"},
        "preferences":{"theme":"dark","fontSize":1.4,"publisherStyles":false}
      }"""
    )
    assertEquals("dark", customPreferences.preferences.theme)
    assertEquals(1.4, customPreferences.preferences.fontSize, 0.0)
    assertEquals(false, customPreferences.preferences.publisherStyles)
    assertEquals(withoutLocator.sourceFingerprint, customPreferences.sourceFingerprint)
  }

  @Test
  fun distinguishesInvalidSourceAndLocator() {
    assertEquals(ReaderOpenRequestErrorKind.INVALID_SOURCE, invalidKindFor("{}"))
    assertEquals(
      ReaderOpenRequestErrorKind.INVALID_LOCATOR,
      invalidKindFor(
        """{
          "source":{"kind":"file","uri":"file:///book.epub"},
          "initialLocator":{"href":"chapter.xhtml"}
        }"""
      ),
    )
    assertEquals(
      ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY,
      invalidKindFor(
        """{
          "source":{"kind":"file","uri":"file:///book.epub"},
          "navigationPolicy":{"chapterTurnGesture":"sometimes"}
        }"""
      ),
    )
    assertEquals(
      ReaderOpenRequestErrorKind.INVALID_PREFERENCES,
      invalidKindFor(
        """{
          "source":{"kind":"file","uri":"file:///book.epub"},
          "preferences":{"lineHeight":9}
        }"""
      ),
    )
    assertEquals(
      ReaderOpenRequestErrorKind.INVALID_TYPOGRAPHY_PROFILE,
      invalidKindFor(
        """{
          "source":{"kind":"file","uri":"file:///book.epub"},
          "typographyProfile":{
            "publisherStyles":"hybrid",
            "defaultFontFamilies":["Missing Family"]
          }
        }""",
        availableFontFamilies = setOf("Installed Family"),
      ),
    )
    assertEquals(
      ReaderOpenRequestErrorKind.INVALID_SELECTION_ACTIONS,
      invalidKindFor(
        """{
          "source":{"kind":"file","uri":"file:///book.epub"},
          "selectionActions":[{"id":"share quote","title":"Share"}]
        }"""
      ),
    )
  }

  @Test
  fun validatesTypographyFamiliesInTheAtomicOpenEnvelope() {
    val request = ReaderOpenRequestCodec.decode(
      """{
        "source":{"kind":"file","uri":"file:///book.epub"},
        "typographyProfile":{
          "publisherStyles":"hybrid",
          "defaultFontFamilies":["Installed Family","serif"],
          "rules":[{
            "target":{"kind":"language","value":"UR"},
            "lineHeight":1.65
          }]
        }
      }""",
      availableFontFamilies = setOf("Installed Family"),
    )

    assertEquals("hybrid", request.typographyProfile?.publisherStyles?.wireValue)
    assertEquals(listOf("Installed Family", "serif"), request.typographyProfile?.defaultFontFamilies)
    assertEquals("ur", request.typographyProfile?.rules?.single()?.target?.value)
  }

  @Test
  fun validatesLocalizedSelectionActionsInTheAtomicOpenEnvelope() {
    val request = ReaderOpenRequestCodec.decode(
      """{
        "source":{"kind":"file","uri":"file:///book.epub"},
        "selectionActions":[
          {"id":"highlight","title":" Highlight "},
          {"id":"copy-reference","title":"حوالہ نقل کریں"}
        ]
      }"""
    )

    assertEquals(
      listOf(
        ResolvedNativeSelectionAction("highlight", "Highlight"),
        ResolvedNativeSelectionAction("copy-reference", "حوالہ نقل کریں"),
      ),
      request.selectionActions,
    )
  }

  private fun invalidKindFor(
    value: String,
    availableFontFamilies: Set<String>? = null,
  ): ReaderOpenRequestErrorKind = try {
    ReaderOpenRequestCodec.decode(value, availableFontFamilies)
    fail("Expected the open request to be rejected.")
    throw AssertionError("unreachable")
  } catch (error: ReaderOpenRequestValidationException) {
    error.kind
  }
}
