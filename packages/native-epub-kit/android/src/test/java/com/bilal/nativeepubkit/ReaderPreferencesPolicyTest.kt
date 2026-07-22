package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.readium.r2.navigator.preferences.Spread

class ReaderPreferencesPolicyTest {
  @Test
  fun mapsAutomaticSpreadToReadiumAbsence() {
    assertNull(readiumSpreadPreference("auto"))
    assertEquals(Spread.NEVER, readiumSpreadPreference("never"))
    assertEquals(Spread.ALWAYS, readiumSpreadPreference("always"))
  }

  @Test
  fun matchesSharedPreferencesContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(contract.getJSONObject("defaults").toSimpleMap(), ResolvedReaderPreferences.DEFAULTS.toMap())
    val ranges = contract.getJSONObject("ranges")
    assertRange(ranges, "fontSize", ReaderPreferencesPolicy.FONT_SIZE_RANGE)
    assertRange(ranges, "pageMargins", ReaderPreferencesPolicy.PAGE_MARGINS_RANGE)
    assertRange(ranges, "lineHeight", ReaderPreferencesPolicy.LINE_HEIGHT_RANGE)

    val normalizationCases = contract.getJSONArray("normalizationCases")
    for (index in 0 until normalizationCases.length()) {
      val testCase = normalizationCases.getJSONObject(index)
      val input = testCase.getJSONObject("input")
      if (!testCase.getBoolean("valid")) {
        assertThrows(testCase.getString("name"), ReaderPreferencesValidationException::class.java) {
          ResolvedReaderPreferences.decode(input)
        }
        continue
      }
      val expected = ResolvedReaderPreferences.DEFAULTS.toMap() + input.toSimpleMap()
      assertEquals(testCase.getString("name"), expected, ResolvedReaderPreferences.decode(input).toMap())
    }

    val policyCases = contract.getJSONArray("policyCases")
    for (index in 0 until policyCases.length()) {
      val testCase = policyCases.getJSONObject(index)
      val preferences = ResolvedReaderPreferences.decode(testCase.getJSONObject("preferences"))
      val fixedLayout = testCase.getString("layout") == "fixed"
      val policy = ReaderPreferencesPolicy.resolve(preferences, fixedLayout)
      assertEquals(
        testCase.getString("name"),
        testCase.getJSONArray("applied").toStrings(),
        policy.appliedNames.map { it.wireValue },
      )
      assertEquals(
        testCase.getString("name"),
        testCase.getJSONObject("unsupported").toSimpleMap(),
        policy.support.filter { !it.supported }.associate { it.name.wireValue to it.reason },
      )
      assertEquals(
        testCase.getString("name"),
        testCase.getJSONArray("warnings").toStrings(),
        policy.warnings,
      )
    }
  }

  private fun assertRange(
    ranges: JSONObject,
    key: String,
    actual: ClosedFloatingPointRange<Double>,
  ) {
    val expected = ranges.getJSONObject(key)
    assertEquals(expected.getDouble("minimum"), actual.start, 0.0)
    assertEquals(expected.getDouble("maximum"), actual.endInclusive, 0.0)
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitPreferencesContract")) {
      "nativeEpubKitPreferencesContract system property is required"
    }
}

private fun JSONObject.toSimpleMap(): Map<String, Any?> =
  keys().asSequence().associateWith { key ->
    val value = opt(key)
    if (value is Number) value.toDouble() else value
  }

private fun JSONArray.toStrings(): List<String> =
  List(length()) { index -> getString(index) }
