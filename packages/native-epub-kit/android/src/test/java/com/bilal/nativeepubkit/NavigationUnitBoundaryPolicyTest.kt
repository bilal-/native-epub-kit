package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NavigationUnitBoundaryPolicyTest {
  @Test
  fun matchesSharedBoundaryCases() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    val units = contract.getJSONArray("units").objects().map(::boundary)
    contract.getJSONArray("boundaryCases").objects().forEach { testCase ->
      val expected = testCase.getJSONObject("expected")
      val configuration = ReaderNavigationUnitBoundaryConfiguration(
        generation = 4,
        instanceId = "boundary-reader",
        precision = testCase.getString("precision"),
        units = units,
      )
      val match = NavigationUnitBoundaryPolicy.match(
        configuration,
        location(testCase.getJSONObject("location")),
        testCase.optString("preferredUnitId").takeIf(String::isNotEmpty),
      )
      assertEquals(testCase.getString("name"), expected.getString("unitId"), match?.unit?.id)
      assertEquals(
        testCase.getString("name"),
        expected.getString("precision"),
        match?.precision,
      )
    }
  }

  @Test
  fun decodesAndValidatesGenerationConfiguration() {
    val units = JSONObject(File(contractPath()).readText()).getJSONArray("units")
    val configuration = ReaderNavigationUnitBoundaryConfiguration.decode(
      JSONObject(
        mapOf(
          "generation" to 8,
          "instanceId" to "reader",
          "precision" to "position",
          "units" to units,
        )
      ).toString()
    )
    assertEquals(8, configuration.generation)
    assertEquals("reader", configuration.instanceId)
    assertThrows(NavigationUnitBoundaryPolicyException::class.java) {
      ReaderNavigationUnitBoundaryConfiguration.decode(
        JSONObject(
          mapOf(
            "generation" to -1,
            "instanceId" to "reader",
            "precision" to "position",
            "units" to units,
          )
        ).toString()
      )
    }
  }

  private fun boundary(value: JSONObject): ReaderNavigationUnitBoundary =
    ReaderNavigationUnitBoundary(
      endPositionExclusive = value.testOptionalInt("endPositionExclusive"),
      endTotalProgression = value.testOptionalDouble("endTotalProgression"),
      href = value.getString("href"),
      id = value.getString("id"),
      startPosition = value.testOptionalInt("startPosition"),
      startTotalProgression = value.testOptionalDouble("startTotalProgression"),
    )

  private fun location(value: JSONObject): ReaderNavigationBoundaryLocation {
    val locations = value.getJSONObject("locations")
    val fragments = (locations.opt("fragments") as? JSONArray)?.let { array ->
      (0 until array.length()).map(array::getString)
    } ?: emptyList()
    return ReaderNavigationBoundaryLocation(
      href = value.getString("href"),
      fragments = fragments,
      position = locations.testOptionalInt("position"),
      totalProgression = locations.testOptionalDouble("totalProgression"),
    )
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitNavigationBoundariesContract")) {
      "nativeEpubKitNavigationBoundariesContract system property is required"
    }
}

private fun JSONArray.objects(): List<JSONObject> =
  (0 until length()).map(::getJSONObject)

private fun JSONObject.testOptionalInt(key: String): Int? =
  if (!has(key) || isNull(key)) null else getInt(key)

private fun JSONObject.testOptionalDouble(key: String): Double? =
  if (!has(key) || isNull(key)) null else getDouble(key)
