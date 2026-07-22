package com.bilal.nativeepubkit

import java.text.Normalizer
import org.json.JSONArray
import org.json.JSONObject

internal data class ResolvedNativeSelectionAction(
  val id: String,
  val title: String,
) {
  fun toJSON(): JSONObject = JSONObject().put("id", id).put("title", title)
}

internal class SelectionActionPolicyException(
  val path: String,
  reason: String,
) : IllegalArgumentException("$path: $reason")

internal object SelectionActionPolicy {
  const val MAXIMUM_ACTIONS = 8
  const val MAXIMUM_ACTION_ID_UTF16_UNITS = 64
  const val MAXIMUM_ACTION_TITLE_UTF16_UNITS = 64
  const val MAXIMUM_SELECTION_TEXT_UTF16_UNITS = 8_192
  const val MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS = 512

  private val actionIdPattern = Regex("^[A-Za-z][A-Za-z0-9._:-]{0,63}$")

  fun resolve(value: Any?): List<ResolvedNativeSelectionAction> {
    if (value == null || value === JSONObject.NULL) return emptyList()
    val input = value as? JSONArray
      ?: throw SelectionActionPolicyException("$/actions", "must be an array")
    if (input.length() > MAXIMUM_ACTIONS) {
      throw SelectionActionPolicyException(
        "$/actions",
        "must contain at most $MAXIMUM_ACTIONS actions",
      )
    }

    val ids = mutableSetOf<String>()
    return (0 until input.length()).map { index ->
      val path = "$/actions/$index"
      val action = input.optJSONObject(index)
        ?: throw SelectionActionPolicyException(path, "must be an object")
      for (key in action.keys()) {
        if (key != "id" && key != "title") {
          throw SelectionActionPolicyException("$path/$key", "is not supported")
        }
      }
      val rawId = action.opt("id") as? String
        ?: throw SelectionActionPolicyException("$path/id", "must be a string")
      val id = rawId.trim()
      if (id.length > MAXIMUM_ACTION_ID_UTF16_UNITS || !actionIdPattern.matches(id)) {
        throw SelectionActionPolicyException(
          "$path/id",
          "must be a safe ASCII identifier within $MAXIMUM_ACTION_ID_UTF16_UNITS UTF-16 units",
        )
      }
      if (!ids.add(id)) {
        throw SelectionActionPolicyException("$path/id", "must be unique")
      }
      ResolvedNativeSelectionAction(id, normalizeTitle(action.opt("title"), "$path/title"))
    }
  }

  fun textDirection(value: String): String {
    val iterator = value.codePoints().iterator()
    while (iterator.hasNext()) {
      val scalar = iterator.nextInt()
      if (isRTL(scalar)) return "rtl"
      if (Character.isLetter(scalar)) return "ltr"
    }
    return "auto"
  }

  private fun normalizeTitle(value: Any?, path: String): String {
    val input = value as? String
      ?: throw SelectionActionPolicyException(path, "must be a string")
    val title = Normalizer.normalize(input, Normalizer.Form.NFC).trim()
    if (title.isEmpty() || title.length > MAXIMUM_ACTION_TITLE_UTF16_UNITS) {
      throw SelectionActionPolicyException(
        path,
        "must contain 1-$MAXIMUM_ACTION_TITLE_UTF16_UNITS UTF-16 units",
      )
    }
    if (title.codePoints().anyMatch { Character.getType(it) == Character.CONTROL.toInt() }) {
      throw SelectionActionPolicyException(path, "must not contain control characters")
    }
    return title
  }

  private fun isRTL(scalar: Int): Boolean =
    scalar in 0x0590..0x08FF ||
      scalar in 0xFB1D..0xFDFF ||
      scalar in 0xFE70..0xFEFF ||
      scalar in 0x1EE00..0x1EEFF
}
