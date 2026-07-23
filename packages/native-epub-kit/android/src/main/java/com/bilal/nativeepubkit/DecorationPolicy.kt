package com.bilal.nativeepubkit

import java.text.Normalizer
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal class DecorationPolicyException(
  val path: String,
  reason: String,
) : IllegalArgumentException("$path: $reason")

internal sealed interface ResolvedNativeDecorationStyle {
  fun toJSON(): JSONObject

  data class Highlight(val tint: String, val isActive: Boolean) : ResolvedNativeDecorationStyle {
    override fun toJSON(): JSONObject = JSONObject()
      .put("type", "highlight")
      .put("tint", tint)
      .put("isActive", isActive)
  }

  data class Underline(val tint: String, val isActive: Boolean) : ResolvedNativeDecorationStyle {
    override fun toJSON(): JSONObject = JSONObject()
      .put("type", "underline")
      .put("tint", tint)
      .put("isActive", isActive)
  }

  data class MarginIcon(val asset: String, val tint: String) : ResolvedNativeDecorationStyle {
    override fun toJSON(): JSONObject = JSONObject()
      .put("type", "margin-icon")
      .put("asset", asset)
      .put("tint", tint)
  }

  data class RoundedBox(
    val tint: String,
    val borderRadius: Double,
    val borderWidth: Double,
    val fillOpacity: Double,
    val isActive: Boolean,
  ) : ResolvedNativeDecorationStyle {
    override fun toJSON(): JSONObject = JSONObject()
      .put("type", "custom")
      .put("template", "rounded-box-v1")
      .put(
        "config",
        JSONObject()
          .put("tint", tint)
          .put("borderWidth", borderWidth)
          .put("borderRadius", borderRadius)
          .put("fillOpacity", fillOpacity)
          .put("isActive", isActive),
      )
  }
}

internal data class ResolvedNativeDecoration(
  val id: String,
  val locator: JSONObject,
  val style: ResolvedNativeDecorationStyle,
  val json: JSONObject,
)

internal sealed interface ResolvedNativeDecorationChange {
  data class Add(val decoration: ResolvedNativeDecoration) : ResolvedNativeDecorationChange
  data class Update(val decoration: ResolvedNativeDecoration) : ResolvedNativeDecorationChange
  data class Remove(val id: String) : ResolvedNativeDecorationChange
}

internal object DecorationPolicy {
  const val MAXIMUM_GROUPS = 32
  const val MAXIMUM_DECORATIONS_PER_GROUP = 10_000
  const val MAXIMUM_CHANGES = 2_048
  const val MAXIMUM_GROUP_UTF16_UNITS = 64
  const val MAXIMUM_ID_UTF16_UNITS = 128
  const val MAXIMUM_DATA_UTF8_BYTES = 8_192

  const val DEFAULT_DECORATION_TINT = "#e8c97a"
  const val DEFAULT_MARGIN_ICON_TINT = "#64748b"

  private val groupPattern = Regex("^[A-Za-z][A-Za-z0-9._:-]{0,63}$")
  private val idPattern = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
  private val tintPattern = Regex("^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")

  fun resolveGroup(value: Any?): String = identifier(value, true, "$/group")

  fun resolveDecoration(
    value: Any?,
    path: String = "$/decoration",
  ): ResolvedNativeDecoration {
    val input = obj(value, path)
    exactKeys(input, setOf("data", "id", "locator", "style"), path)
    val id = identifier(input.opt("id"), false, "$path/id")
    val locatorInput = input.opt("locator") as? JSONObject
      ?: throw DecorationPolicyException("$path/locator", "must be an object")
    val locator = try {
      (SharedCoreRecordCodec.decode(
        SharedCoreRecordType.LOCATOR,
        locatorInput,
      ) as SharedLocatorRecord).json
    } catch (_: Throwable) {
      throw DecorationPolicyException("$path/locator", "must be a valid locator")
    }
    val style = resolveStyle(input.opt("style"), "$path/style")
    val normalized = JSONObject()
      .put("id", id)
      .put("locator", JSONObject(locator.toString()))
      .put("style", style.toJSON())
    if (input.has("data")) {
      val data = input.get("data")
      val encoded = jsonValueString(data).toByteArray(Charsets.UTF_8)
      if (encoded.size > MAXIMUM_DATA_UTF8_BYTES) {
        throw DecorationPolicyException(
          "$path/data",
          "must contain at most $MAXIMUM_DATA_UTF8_BYTES UTF-8 bytes",
        )
      }
      normalized.put("data", cloneJsonValue(data))
    }
    val record = try {
      SharedCoreRecordCodec.decode(SharedCoreRecordType.READER_DECORATION, normalized)
        as SharedReaderDecorationRecord
    } catch (_: Throwable) {
      throw DecorationPolicyException(path, "must be a valid decoration record")
    }
    return ResolvedNativeDecoration(
      id = id,
      locator = JSONObject(locator.toString()),
      style = style,
      json = record.json,
    )
  }

  fun resolveDecorations(
    group: Any?,
    values: Any?,
  ): Pair<String, List<ResolvedNativeDecoration>> {
    val normalizedGroup = resolveGroup(group)
    val input = values as? JSONArray
      ?: throw DecorationPolicyException("$/decorations", "must be an array")
    if (input.length() > MAXIMUM_DECORATIONS_PER_GROUP) {
      throw DecorationPolicyException(
        "$/decorations",
        "must contain at most $MAXIMUM_DECORATIONS_PER_GROUP decorations",
      )
    }
    val ids = mutableSetOf<String>()
    val decorations = (0 until input.length()).map { index ->
      val decoration = resolveDecoration(input.opt(index), "$/decorations/$index")
      if (!ids.add(decoration.id)) {
        throw DecorationPolicyException(
          "$/decorations/$index/id",
          "must be unique within its group",
        )
      }
      decoration
    }
    return normalizedGroup to decorations
  }

  fun resolveChanges(
    group: Any?,
    values: Any?,
  ): Pair<String, List<ResolvedNativeDecorationChange>> {
    val normalizedGroup = resolveGroup(group)
    val input = values as? JSONArray
      ?: throw DecorationPolicyException("$/changes", "must be an array")
    if (input.length() > MAXIMUM_CHANGES) {
      throw DecorationPolicyException(
        "$/changes",
        "must contain at most $MAXIMUM_CHANGES changes",
      )
    }
    val changes = (0 until input.length()).map { index ->
      val path = "$/changes/$index"
      val change = obj(input.opt(index), path)
      val type = change.opt("type") as? String
        ?: throw DecorationPolicyException("$path/type", "must be a string")
      when (type) {
        "add", "update" -> {
          exactKeys(change, setOf("decoration", "type"), path)
          val decoration = resolveDecoration(change.opt("decoration"), "$path/decoration")
          if (type == "add") {
            ResolvedNativeDecorationChange.Add(decoration)
          } else {
            ResolvedNativeDecorationChange.Update(decoration)
          }
        }
        "remove" -> {
          exactKeys(change, setOf("id", "type"), path)
          ResolvedNativeDecorationChange.Remove(identifier(change.opt("id"), false, "$path/id"))
        }
        else -> throw DecorationPolicyException("$path/type", "is unsupported")
      }
    }
    return normalizedGroup to changes
  }

  fun applyChanges(
    current: List<ResolvedNativeDecoration>,
    changes: List<ResolvedNativeDecorationChange>,
  ): List<ResolvedNativeDecoration> {
    val next = current.toMutableList()
    val indexById = next.mapIndexed { index, decoration -> decoration.id to index }.toMap().toMutableMap()
    for (change in changes) {
      when (change) {
        is ResolvedNativeDecorationChange.Add -> {
          if (indexById.containsKey(change.decoration.id)) {
            throw DecorationPolicyException("$/changes", "add references an existing id")
          }
          if (next.size >= MAXIMUM_DECORATIONS_PER_GROUP) {
            throw DecorationPolicyException(
              "$/changes",
              "would exceed $MAXIMUM_DECORATIONS_PER_GROUP decorations",
            )
          }
          indexById[change.decoration.id] = next.size
          next += change.decoration
        }
        is ResolvedNativeDecorationChange.Update -> {
          val index = indexById[change.decoration.id]
            ?: throw DecorationPolicyException("$/changes", "update references a missing id")
          next[index] = change.decoration
        }
        is ResolvedNativeDecorationChange.Remove -> {
          val index = indexById[change.id]
            ?: throw DecorationPolicyException("$/changes", "remove references a missing id")
          next.removeAt(index)
          indexById.clear()
          next.forEachIndexed { nextIndex, decoration -> indexById[decoration.id] = nextIndex }
        }
      }
    }
    return next
  }

  private fun resolveStyle(value: Any?, path: String): ResolvedNativeDecorationStyle {
    val style = obj(value, path)
    val type = style.opt("type") as? String
      ?: throw DecorationPolicyException("$path/type", "must be a string")
    return when (type) {
      "highlight", "underline" -> {
        exactKeys(style, setOf("isActive", "tint", "type"), path)
        val tint = tint(style.opt("tint"), null, "$path/tint")
        val isActive = optionalBoolean(style.optionalValue("isActive"), false, "$path/isActive")
        if (type == "highlight") {
          ResolvedNativeDecorationStyle.Highlight(tint, isActive)
        } else {
          ResolvedNativeDecorationStyle.Underline(tint, isActive)
        }
      }
      "margin-icon" -> {
        exactKeys(style, setOf("asset", "tint", "type"), path)
        val asset = style.opt("asset") as? String
        if (asset !in setOf("bookmark", "note")) {
          throw DecorationPolicyException("$path/asset", "is unsupported")
        }
        ResolvedNativeDecorationStyle.MarginIcon(
          asset = requireNotNull(asset),
          tint = tint(style.optionalValue("tint"), DEFAULT_MARGIN_ICON_TINT, "$path/tint"),
        )
      }
      "custom" -> {
        exactKeys(style, setOf("config", "template", "type"), path)
        if (style.opt("template") != "rounded-box-v1") {
          throw DecorationPolicyException("$path/template", "is unsupported")
        }
        val config = style.optionalValue("config")?.let { obj(it, "$path/config") } ?: JSONObject()
        exactKeys(
          config,
          setOf("borderRadius", "borderWidth", "fillOpacity", "isActive", "tint"),
          "$path/config",
        )
        ResolvedNativeDecorationStyle.RoundedBox(
          tint = tint(config.optionalValue("tint"), DEFAULT_DECORATION_TINT, "$path/config/tint"),
          borderRadius = boundedNumber(
            config.optionalValue("borderRadius"), 4.0, 0.0, 12.0, "$path/config/borderRadius",
          ),
          borderWidth = boundedNumber(
            config.optionalValue("borderWidth"), 2.0, 1.0, 4.0, "$path/config/borderWidth",
          ),
          fillOpacity = boundedNumber(
            config.optionalValue("fillOpacity"), 0.12, 0.0, 0.5, "$path/config/fillOpacity",
          ),
          isActive = optionalBoolean(
            config.optionalValue("isActive"), false, "$path/config/isActive",
          ),
        )
      }
      else -> throw DecorationPolicyException("$path/type", "is unsupported")
    }
  }

  private fun identifier(value: Any?, group: Boolean, path: String): String {
    val input = value as? String
      ?: throw DecorationPolicyException(path, "must be a string")
    val normalized = Normalizer.normalize(input, Normalizer.Form.NFC).trim()
    val limit = if (group) MAXIMUM_GROUP_UTF16_UNITS else MAXIMUM_ID_UTF16_UNITS
    val pattern = if (group) groupPattern else idPattern
    if (normalized.length > limit || !pattern.matches(normalized)) {
      throw DecorationPolicyException(path, "has an unsupported format")
    }
    return normalized
  }

  private fun tint(value: Any?, fallback: String?, path: String): String {
    val resolved = value ?: fallback
    val input = resolved as? String
      ?: throw DecorationPolicyException(path, "must be a string")
    if (!tintPattern.matches(input)) {
      throw DecorationPolicyException(path, "must use #RRGGBB or #RRGGBBAA")
    }
    return input.lowercase()
  }

  private fun optionalBoolean(value: Any?, fallback: Boolean, path: String): Boolean {
    if (value == null) return fallback
    return value as? Boolean
      ?: throw DecorationPolicyException(path, "must be a boolean")
  }

  private fun boundedNumber(
    value: Any?,
    fallback: Double,
    minimum: Double,
    maximum: Double,
    path: String,
  ): Double {
    if (value == null) return fallback
    val result = (value as? Number)?.toDouble()
      ?: throw DecorationPolicyException(path, "must be a number")
    if (!result.isFinite() || result !in minimum..maximum) {
      throw DecorationPolicyException(path, "must be within $minimum...$maximum")
    }
    return result
  }

  private fun obj(value: Any?, path: String): JSONObject = value as? JSONObject
    ?: throw DecorationPolicyException(path, "must be an object")

  private fun exactKeys(value: JSONObject, allowed: Set<String>, path: String) {
    for (key in value.keys()) {
      if (key !in allowed) throw DecorationPolicyException("$path/$key", "is not supported")
    }
  }

  private fun JSONObject.optionalValue(key: String): Any? = if (has(key)) get(key) else null

  private fun cloneJsonValue(value: Any): Any =
    JSONTokener(jsonValueString(value)).nextValue()

  private fun jsonValueString(value: Any): String = JSONArray().put(value).toString().let {
    it.substring(1, it.length - 1)
  }
}
