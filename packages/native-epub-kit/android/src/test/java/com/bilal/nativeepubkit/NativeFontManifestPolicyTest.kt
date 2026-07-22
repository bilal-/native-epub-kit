package com.bilal.nativeepubkit

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeFontManifestPolicyTest {
  @Test
  fun sharedManifestCasesValidateAtomicallyAndGroupInDeclarationOrder() {
    val contract = JSONObject(
      File(requireNotNull(System.getProperty("nativeEpubKitFontManifestContract"))).readText()
    )
    assertEquals(1, contract.getInt("version"))
    assertEquals(NativeFontManifestPolicy.SCHEMA_VERSION, contract.getInt("schemaVersion"))
    assertEquals(NativeFontManifestPolicy.MAXIMUM_FACES, contract.getInt("maximumFaces"))

    val cases = contract.getJSONArray("cases")
    for (index in 0 until cases.length()) {
      val testCase = cases.getJSONObject(index)
      val platform = when (testCase.getString("platform")) {
        "android" -> NativeFontPlatform.ANDROID
        "ios" -> NativeFontPlatform.IOS
        else -> error("Unknown font-manifest platform")
      }
      val manifest = testCase.opt("manifest").takeUnless { it == JSONObject.NULL } as? JSONObject
      val available = testCase.getJSONArray("availableFiles").stringSet()
      val result = NativeFontManifestPolicy.validate(manifest, platform, available::contains)
      val expected = testCase.getJSONObject("expected")
      assertEquals(testCase.getString("name"), expected.getString("status"), result.status)
      assertEquals(testCase.getString("name"), expected.getInt("faceCount"), result.faceCount)
      assertEquals(testCase.getString("name"), expected.getInt("familyCount"), result.familyCount)
      assertEquals(
        testCase.getString("name"),
        expected.getJSONArray("families").canonicalFamilies(),
        result.families.map { family ->
          family.family to family.faces.map { Triple(it.file, it.style, it.weight) }
        }
      )
    }
  }

  @Test
  fun moreThanMaximumFacesIsRejectedWithoutPartialRegistration() {
    val fonts = JSONArray()
    val available = mutableSetOf<String>()
    repeat(NativeFontManifestPolicy.MAXIMUM_FACES + 1) { index ->
      val file = "NativeEpubKit-$index-Face.ttf"
      fonts.put(
        JSONObject()
          .put("family", "Family $index")
          .put("file", file)
          .put("path", file)
          .put("style", "normal")
          .put("weight", 400)
      )
      available += file
    }
    val result = NativeFontManifestPolicy.validate(
      JSONObject().put("schemaVersion", 1).put("fonts", fonts),
      NativeFontPlatform.IOS,
      available::contains,
    )
    assertEquals("invalid", result.status)
    assertEquals(emptyList<NativeFontDefinition>(), result.fonts)
    assertEquals(emptyList<NativeFontFamilyDefinition>(), result.families)
  }

  private fun JSONArray.stringSet(): Set<String> =
    (0 until length()).map(::getString).toSet()

  private fun JSONArray.canonicalFamilies(): List<Pair<String, List<Triple<String, String, Int>>>> =
    (0 until length()).map { index ->
      val family = getJSONObject(index)
      val faces = family.getJSONArray("faces")
      family.getString("family") to (0 until faces.length()).map { faceIndex ->
        val face = faces.getJSONObject(faceIndex)
        Triple(face.getString("file"), face.getString("style"), face.getInt("weight"))
      }
    }
}
