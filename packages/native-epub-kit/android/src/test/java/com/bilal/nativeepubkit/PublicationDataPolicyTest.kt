package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PublicationDataPolicyTest {
  @Test
  fun matchesSharedPagingAndTocContract() {
    val contract = JSONObject(File(contractPath()).readText())
    assertEquals(1, contract.getInt("version"))
    assertEquals(
      contract.getInt("defaultPositionPageSize"),
      PublicationDataPolicy.DEFAULT_POSITION_PAGE_SIZE,
    )
    assertEquals(
      contract.getInt("maximumPositionPageSize"),
      PublicationDataPolicy.MAXIMUM_POSITION_PAGE_SIZE,
    )

    val pageCases = contract.getJSONArray("pageCases")
    for (index in 0 until pageCases.length()) {
      val testCase = pageCases.getJSONObject(index)
      val bounds = PublicationDataPolicy.positionPageBounds(
        total = testCase.getInt("total"),
        requestedOffset = testCase.getInt("offset"),
        requestedLimit = testCase.optNullableInt("limit"),
      )
      assertEquals(testCase.getString("name"), testCase.getInt("expectedOffset"), bounds.offset)
      assertEquals(testCase.getString("name"), testCase.getInt("expectedCount"), bounds.count)
      assertEquals(
        testCase.getString("name"),
        testCase.optNullableInt("expectedNextOffset"),
        bounds.nextOffset,
      )
    }

    val tocCases = contract.getJSONArray("tocCases")
    for (index in 0 until tocCases.length()) {
      val testCase = tocCases.getJSONObject(index)
      val warnings = PublicationDataPolicy.warnings(
        tableOfContents = testCase.getJSONArray("tableOfContents").toLinkShapes(),
        readingOrderHrefs = testCase.getJSONArray("readingOrderHrefs").toStrings(),
        positionCount = testCase.getInt("positionCount"),
        fixedLayout = testCase.getBoolean("fixedLayout"),
      )
      assertEquals(
        testCase.getString("name"),
        testCase.getJSONArray("expectedWarnings").toStrings(),
        warnings,
      )
    }
  }

  private fun contractPath(): String =
    requireNotNull(System.getProperty("nativeEpubKitPublicationDataContract")) {
      "nativeEpubKitPublicationDataContract system property is required"
    }
}

private fun JSONObject.optNullableInt(key: String): Int? =
  if (isNull(key)) null else getInt(key)

private fun JSONArray.toStrings(): List<String> =
  List(length()) { index -> getString(index) }

private fun JSONArray.toLinkShapes(): List<PublicationDataLinkShape> =
  List(length()) { index ->
    val value = getJSONObject(index)
    PublicationDataLinkShape(
      href = value.getString("href"),
      children = value.getJSONArray("children").toLinkShapes(),
    )
  }
