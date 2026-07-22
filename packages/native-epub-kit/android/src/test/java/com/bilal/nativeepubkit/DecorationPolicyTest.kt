package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class DecorationPolicyTest {
  private val contract: JSONObject
    get() = JSONObject(
      File(
        requireNotNull(System.getProperty("nativeEpubKitDecorationPolicyContract")),
      ).readText(Charsets.UTF_8),
    )

  @Test
  fun normalizationBoundsAndAtomicDeltasMatchTheSharedContract() {
    val contract = contract
    assertEquals(1, contract.getInt("version"))
    assertEquals(contract.getInt("maximumGroups"), DecorationPolicy.MAXIMUM_GROUPS)
    assertEquals(
      contract.getInt("maximumDecorationsPerGroup"),
      DecorationPolicy.MAXIMUM_DECORATIONS_PER_GROUP,
    )
    assertEquals(contract.getInt("maximumChanges"), DecorationPolicy.MAXIMUM_CHANGES)
    assertEquals(
      contract.getInt("maximumGroupUtf16Units"),
      DecorationPolicy.MAXIMUM_GROUP_UTF16_UNITS,
    )
    assertEquals(
      contract.getInt("maximumIdUtf16Units"),
      DecorationPolicy.MAXIMUM_ID_UTF16_UNITS,
    )
    assertEquals(
      contract.getInt("maximumDataUtf8Bytes"),
      DecorationPolicy.MAXIMUM_DATA_UTF8_BYTES,
    )

    val groupCases = contract.getJSONArray("groupCases")
    for (index in 0 until groupCases.length()) {
      val testCase = groupCases.getJSONObject(index)
      if (testCase.optBoolean("expectedError", false)) {
        expectPolicyFailure(testCase.getString("name")) {
          DecorationPolicy.resolveDecorations(testCase.getString("input"), JSONArray())
        }
      } else {
        assertEquals(
          testCase.getString("name"),
          testCase.getString("expected"),
          DecorationPolicy.resolveDecorations(
            testCase.getString("input"),
            JSONArray(),
          ).first,
        )
      }
    }

    val baseLocator = contract.getJSONObject("baseLocator")
    val styleCases = contract.getJSONArray("styleCases")
    for (index in 0 until styleCases.length()) {
      val testCase = styleCases.getJSONObject(index)
      val action = {
        DecorationPolicy.resolveDecoration(
          JSONObject()
            .put("id", "contract-style")
            .put("locator", JSONObject(baseLocator.toString()))
            .put("style", JSONObject(testCase.getJSONObject("input").toString())),
        )
      }
      if (testCase.optBoolean("expectedError", false)) {
        expectPolicyFailure(testCase.getString("name"), action)
      } else {
        val actual = action().style.toJSON()
        val expected = testCase.getJSONObject("expected")
        assertEquals(
          testCase.getString("name"),
          comparableJson(expected),
          comparableJson(actual),
        )
      }
    }

    val deltaCases = contract.getJSONArray("deltaCases")
    for (index in 0 until deltaCases.length()) {
      val testCase = deltaCases.getJSONObject(index)
      val action = {
        val initial = testCase.getJSONArray("initial").mapObjects { expand(it, baseLocator) }
          .map(DecorationPolicy::resolveDecoration)
        val changes = JSONArray()
        val inputChanges = testCase.getJSONArray("changes")
        for (changeIndex in 0 until inputChanges.length()) {
          val input = inputChanges.getJSONObject(changeIndex)
          val change = JSONObject().put("type", input.getString("type"))
          if (input.getString("type") == "remove") {
            change.put("id", input.getString("id"))
          } else {
            change.put("decoration", expand(input.getJSONObject("decoration"), baseLocator))
          }
          changes.put(change)
        }
        val resolved = DecorationPolicy.resolveChanges("annotations", changes).second
        DecorationPolicy.applyChanges(initial, resolved)
      }
      if (testCase.optBoolean("expectedError", false)) {
        expectPolicyFailure(testCase.getString("name"), action)
      } else {
        val actual = JSONArray()
        for (decoration in action()) {
          actual.put(JSONObject().put("id", decoration.id).put("style", decoration.style.toJSON()))
        }
        val expected = testCase.getJSONArray("expected")
        assertEquals(
          testCase.getString("name"),
          comparableJson(expected),
          comparableJson(actual),
        )
      }
    }
  }

  @Test
  fun nullableEventConversionReadsTheSourceJsonInsteadOfTheEmptyBuilder() {
    val source = JSONObject()
      .put("id", "annotation-highlight")
      .put("locator", JSONObject().put("href", "EPUB/text/stress.xhtml"))
      .put("data", JSONObject().put("note", JSONObject.NULL))
      .put("tags", JSONArray().put("one").put(JSONObject.NULL))

    assertEquals(
      mapOf(
        "id" to "annotation-highlight",
        "locator" to mapOf("href" to "EPUB/text/stress.xhtml"),
        "data" to mapOf("note" to null),
        "tags" to listOf("one", null),
      ),
      source.toNullableEventValue(),
    )
  }

  private fun expand(shape: JSONObject, locator: JSONObject): JSONObject = JSONObject()
    .put("id", shape.getString("id"))
    .put("locator", JSONObject(locator.toString()))
    .put("style", JSONObject(shape.getJSONObject("style").toString()))

  private fun JSONArray.mapObjects(transform: (JSONObject) -> JSONObject): List<JSONObject> =
    (0 until length()).map { transform(getJSONObject(it)) }

  private fun comparableJson(value: Any?): Any? = when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> value.keys().asSequence().sorted().associateWith {
      comparableJson(value.get(it))
    }
    is JSONArray -> (0 until value.length()).map { comparableJson(value.get(it)) }
    is Number -> value.toDouble()
    else -> value
  }

  private fun expectPolicyFailure(name: String, action: () -> Any?) {
    try {
      action()
      fail("$name should fail")
    } catch (_: DecorationPolicyException) {
      // Expected.
    }
  }
}
