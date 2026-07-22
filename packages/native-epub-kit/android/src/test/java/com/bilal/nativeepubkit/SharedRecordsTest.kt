package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SharedRecordsTest {
  private val contractRoot: File
    get() = File(
      requireNotNull(System.getProperty("nativeEpubKitCoreContractsDir")) {
        "nativeEpubKitCoreContractsDir was not configured by Gradle"
      }
    )

  @Test
  fun coreV1GoldenRecordsValidateAndRoundTrip() {
    val files = requireNotNull(
      File(contractRoot, "cases").listFiles { file -> file.extension == "json" }
    ).sortedBy(File::getName)
    assertEquals(15, files.size)

    val seenTypes = mutableSetOf<SharedCoreRecordType>()
    for (file in files) {
      val envelope = JSONObject(file.readText(Charsets.UTF_8))
      assertEquals(1, envelope.getInt("schemaVersion"))
      assertEquals(file.nameWithoutExtension, envelope.getString("caseId"))
      val type = SharedCoreRecordType.fromWireValue(envelope.getString("recordType"))
      assertTrue("Duplicate record type in ${file.name}", seenTypes.add(type))

      val payload = envelope.getJSONObject("payload")
      val record = SharedCoreRecordCodec.decode(type, payload)
      val encoded = SharedCoreRecordCodec.encode(record)
      assertNotSame(payload, encoded)
      assertJsonEquivalent(payload, encoded, file.name)

      if (type == SharedCoreRecordType.LOCATOR) {
        val locator = record as SharedLocatorRecord
        assertEquals("text/chapter-2.xhtml", locator.href)
        assertSame(JSONObject.NULL, encoded.get("title"))
        assertSame(JSONObject.NULL, encoded.getJSONObject("vendorExtension").get("nullable"))
      }
      if (type == SharedCoreRecordType.READER_ERROR) {
        val error = record as SharedReaderErrorRecord
        assertEquals(SharedReaderErrorCode.INVALID_LOCATOR, error.code)
        assertEquals(SharedReaderErrorPhase.NAVIGATE, error.phase)
        assertTrue(error.recoverable)
      }
    }
    assertEquals(SharedCoreRecordType.entries.toSet(), seenTypes)
  }

  @Test
  fun enumUnitsAndNullabilityMatchManifestExactly() {
    val manifest = JSONObject(File(contractRoot, "manifest.json").readText(Charsets.UTF_8))
    assertEquals(1, manifest.getInt("schemaVersion"))
    assertEquals(SharedCoreRecordContract.recordTypes, strings(manifest.getJSONArray("recordTypes")))

    val manifestEnums = manifest.getJSONObject("enums")
    assertEquals(SharedCoreRecordContract.enumValues.keys, manifestEnums.keys().asSequence().toSet())
    for ((key, values) in SharedCoreRecordContract.enumValues) {
      assertEquals("Enum $key differs", values, strings(manifestEnums.getJSONArray(key)))
    }
    assertStringMapEquals(SharedCoreRecordContract.units, manifest.getJSONObject("units"))
    assertStringMapEquals(
      SharedCoreRecordContract.nullability,
      manifest.getJSONObject("nullability"),
    )
  }

  @Test
  fun invalidUnitsEnumsAndNullabilityAreRejectedWithStablePaths() {
    val invalidProgression = JSONObject(
      """
      {
        "href": "text/chapter.xhtml",
        "type": "application/xhtml+xml",
        "locations": { "progression": 1.1 }
      }
      """.trimIndent()
    )
    val progressionError = expectValidationFailure {
      SharedCoreRecordCodec.decode(SharedCoreRecordType.LOCATOR, invalidProgression)
    }
    assertEquals("$/locations/progression", progressionError.path)

    val invalidGeometry = JSONObject(
      """
      {
        "coordinateSpace": "native-pixels",
        "viewport": { "width": 390, "height": 612 }
      }
      """.trimIndent()
    )
    assertEquals(
      "$/coordinateSpace",
      expectValidationFailure {
        SharedCoreRecordCodec.decode(SharedCoreRecordType.READER_GEOMETRY, invalidGeometry)
      }.path,
    )

    val invalidTextNull = JSONObject(
      """
      {
        "href": "text/chapter.xhtml",
        "type": "application/xhtml+xml",
        "text": { "highlight": null }
      }
      """.trimIndent()
    )
    assertEquals(
      "$/text/highlight",
      expectValidationFailure {
        SharedCoreRecordCodec.decode(SharedCoreRecordType.LOCATOR, invalidTextNull)
      }.path,
    )
  }

  @Test
  fun nativeErrorAliasesMapToStableFamiliesAndRetainNativeIdentity() {
    val record = SharedReaderErrorMapper.record(
      nativeCode = "NAVIGATOR_RUNTIME_FAILED",
      nativePhase = "webview",
      message = "The navigator failed.",
      recoverable = true,
    )
    assertEquals(SharedReaderErrorCode.RESOURCE_LOAD_FAILED, record.code)
    assertEquals(SharedReaderErrorPhase.RENDER, record.phase)
    val details = record.json.getJSONObject("nativeDetails")
    assertEquals("NAVIGATOR_RUNTIME_FAILED", details.getString("nativeCode"))
    assertEquals("webview", details.getString("nativePhase"))
    assertEquals(
      SharedReaderErrorCode.TYPOGRAPHY_CONFIGURATION_FAILED,
      SharedReaderErrorMapper.code("TYPOGRAPHY_CONFIGURATION_FAILED"),
    )
  }

  private fun expectValidationFailure(block: () -> Unit): SharedRecordValidationException {
    try {
      block()
      fail("Expected SharedRecordValidationException")
    } catch (error: SharedRecordValidationException) {
      return error
    }
    error("unreachable")
  }

  private fun strings(array: JSONArray): List<String> =
    (0 until array.length()).map(array::getString)

  private fun assertStringMapEquals(expected: Map<String, String>, actual: JSONObject) {
    assertEquals(expected.keys, actual.keys().asSequence().toSet())
    for ((key, value) in expected) assertEquals("Value $key differs", value, actual.getString(key))
  }

  private fun assertJsonEquivalent(expected: Any, actual: Any, context: String) {
    when (expected) {
      is JSONObject -> {
        require(actual is JSONObject) { "$context changed an object into ${actual::class}" }
        val expectedKeys = expected.keys().asSequence().toSet()
        val actualKeys = actual.keys().asSequence().toSet()
        assertEquals("$context changed object keys", expectedKeys, actualKeys)
        for (key in expectedKeys) {
          assertJsonEquivalent(expected.get(key), actual.get(key), "$context/$key")
        }
      }
      is JSONArray -> {
        require(actual is JSONArray) { "$context changed an array into ${actual::class}" }
        assertEquals("$context changed array length", expected.length(), actual.length())
        for (index in 0 until expected.length()) {
          assertJsonEquivalent(expected.get(index), actual.get(index), "$context/$index")
        }
      }
      JSONObject.NULL -> assertSame("$context did not preserve null", JSONObject.NULL, actual)
      is Number -> assertEquals("$context changed a number", expected.toString(), actual.toString())
      else -> assertEquals("$context changed a scalar", expected, actual)
    }
  }
}
