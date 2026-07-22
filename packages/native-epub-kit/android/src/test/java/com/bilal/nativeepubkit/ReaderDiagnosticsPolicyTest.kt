package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ReaderDiagnosticsPolicyTest {
  @Test
  fun matchesSharedDiagnosticsContractWithoutSensitivePublicationData() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(1, ReaderDiagnosticsPolicy.SCHEMA_VERSION)
    assertEquals(64, ReaderDiagnosticsPolicy.MAXIMUM_WARNINGS)
    assertEquals(contract.getJSONArray("featureNames").strings(), ReaderDiagnosticsPolicy.FEATURE_NAMES)

    val cases = contract.getJSONArray("cases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val publication = testCase.getJSONObject("publication")
      val capabilitiesObject = publication.getJSONObject("capabilities")
      val capabilities = listOf(
        "customFonts",
        "decorations",
        "footnotes",
        "images",
        "positions",
        "search",
        "selection",
      ).associateWith(capabilitiesObject::getBoolean)
      val fontsObject = testCase.getJSONObject("fonts")
      val preferences = ResolvedReaderPreferences.decode(testCase.getJSONObject("preferences"))
      val preferencesStatus = ReaderPreferencesPolicy.statusPayload(
        preferences = preferences,
        fixedLayout = publication.getString("layout") == "fixed",
        instanceId = "must-not-escape",
        generation = 7,
      )
      val toolkit = testCase.getJSONObject("toolkit")
      val payload = ReaderDiagnosticsPolicy.payload(
        platform = testCase.getString("platform"),
        sdkVersion = contract.getJSONObject("sdk").getString("version"),
        toolkitName = toolkit.getString("name"),
        toolkitVersion = toolkit.getString("version"),
        toolkitRevision = toolkit.getString("revision"),
        generation = 7,
        publication = ReaderDiagnosticsPublicationInput(
          layout = publication.getString("layout"),
          readingProgression = publication.getString("readingProgression"),
          positionCount = publication.getInt("positionCount"),
          progressPrecision = publication.getString("progressPrecision"),
          mappingDurationMilliseconds = publication.getLong("mappingDurationMilliseconds"),
          capabilities = capabilities,
          warnings = publication.getJSONArray("warnings").strings(),
        ),
        fonts = ReaderFontManifestDiagnostics(
          status = fontsObject.getString("status"),
          faceCount = fontsObject.getInt("faceCount"),
          familyCount = fontsObject.getInt("familyCount"),
        ),
        preferencesStatus = preferencesStatus,
      )

      val json = JSONObject(payload)
      val expected = testCase.getJSONObject("expected")
      val features = json.getJSONArray("features")
      assertEquals(
        testCase.getString("name"),
        expected.getJSONArray("enabled").strings(),
        features.objects().filter { it.getBoolean("enabled") }.map { it.getString("name") },
      )
      assertEquals(
        testCase.getString("name"),
        expected.getJSONObject("stages").stringMap(),
        features.objects().associate { it.getString("name") to it.getString("stage") },
      )
      assertEquals(
        testCase.getString("name"),
        expected.getJSONArray("warnings").strings(),
        json.getJSONArray("warnings").strings(),
      )

      val report = json.toString(2)
      assertFalse(report.contains("must-not-escape"))
      val redaction = contract.getJSONObject("redaction")
      for (fragment in redaction.getJSONArray("forbiddenFragments").strings()) {
        assertFalse("${testCase.getString("name")}: $fragment", report.contains(fragment))
      }
      val forbiddenKeys = redaction.getJSONArray("forbiddenKeys").strings().toSet()
      assertEquals(emptySet<String>(), collectKeys(json).intersect(forbiddenKeys))
    }
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitDiagnosticsContract")) {
      "nativeEpubKitDiagnosticsContract system property is required"
    }
}

private fun JSONArray.strings(): List<String> = List(length()) { getString(it) }

private fun JSONArray.objects(): List<JSONObject> = List(length()) { getJSONObject(it) }

private fun JSONObject.stringMap(): Map<String, String> =
  keys().asSequence().associateWith(::getString)

private fun collectKeys(value: Any?): Set<String> = when (value) {
  is JSONObject -> value.keys().asSequence().flatMap { key ->
    sequenceOf(key) + collectKeys(value.opt(key)).asSequence()
  }.toSet()
  is JSONArray -> (0 until value.length()).flatMap { collectKeys(value.opt(it)) }.toSet()
  else -> emptySet()
}
