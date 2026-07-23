package com.bilal.nativeepubkit.contracts

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedContractFixtureTest {
  @Test
  fun sharedJsonContractCasesLoadAndRoundTrip() {
    val casesDirectory = File(
      requireNotNull(System.getProperty("nativeEpubKitContractsDir")) {
        "nativeEpubKitContractsDir was not configured by Gradle"
      }
    )
    val files = requireNotNull(casesDirectory.listFiles { file -> file.extension == "json" }) {
      "Could not read shared contract fixtures at ${casesDirectory.path}"
    }.sortedBy(File::getName)

    assertEquals(4, files.size)
    val caseIds = mutableSetOf<String>()

    for (file in files) {
      val fixture = JSONObject(file.readText(Charsets.UTF_8))
      assertEquals(1, fixture.getInt("schemaVersion"))
      assertEquals(file.nameWithoutExtension, fixture.getString("caseId"))
      assertTrue("Duplicate case ID in ${file.name}", caseIds.add(fixture.getString("caseId")))

      val roundTripped = JSONObject(fixture.toString())
      assertJsonEquivalent(fixture, roundTripped, file.name)

      val expectations = fixture.getJSONObject("expectations")
      val requiredPointers = expectations.getJSONArray("requiredJsonPointers")
      for (index in 0 until requiredPointers.length()) {
        query(fixture, requiredPointers.getString(index))
      }

      val explicitNullPointers = expectations.getJSONArray("explicitNullJsonPointers")
      for (index in 0 until explicitNullPointers.length()) {
        assertSame(JSONObject.NULL, query(fixture, explicitNullPointers.getString(index)))
      }
    }
  }

  private fun query(root: Any, pointer: String): Any {
    require(pointer.startsWith('/')) { "Invalid JSON pointer: $pointer" }
    return pointer.drop(1).split('/').fold(root) { current, encodedSegment ->
      val segment = encodedSegment.replace("~1", "/").replace("~0", "~")
      when (current) {
        is JSONObject -> current.get(segment)
        is JSONArray -> current.get(segment.toInt())
        else -> error("$pointer traversed through a scalar value")
      }
    }
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
