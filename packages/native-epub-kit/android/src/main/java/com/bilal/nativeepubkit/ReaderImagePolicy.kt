package com.bilal.nativeepubkit

import org.json.JSONObject

internal enum class ReaderImageUse(val wireValue: String) {
  ZOOM("zoom"),
  SHARE("share");

  companion object {
    fun from(value: String): ReaderImageUse? = entries.firstOrNull { it.wireValue == value }
  }
}

internal data class ResolvedReaderImagePolicy(
  val allowSharing: Boolean,
  val allowZoom: Boolean,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("allowSharing", allowSharing)
    .put("allowZoom", allowZoom)
}

internal object ReaderImagePolicy {
  const val MAXIMUM_SOURCE_HANDLE_UTF16_UNITS = 128
  val DEFAULT = ResolvedReaderImagePolicy(allowSharing = false, allowZoom = true)

  fun resolve(json: String?): ResolvedReaderImagePolicy =
    if (json == null) DEFAULT else resolve(JSONObject(json))

  fun resolve(value: Any?): ResolvedReaderImagePolicy {
    if (value == null || value == JSONObject.NULL) return DEFAULT
    val input = value as? JSONObject ?: throw IllegalArgumentException("Invalid image policy")
    require(input.keys().asSequence().all { it == "allowSharing" || it == "allowZoom" })
    val sharing = input.opt("allowSharing") ?: DEFAULT.allowSharing
    val zoom = input.opt("allowZoom") ?: DEFAULT.allowZoom
    require(sharing is Boolean && zoom is Boolean)
    return ResolvedReaderImagePolicy(allowSharing = sharing, allowZoom = zoom)
  }

  fun allows(use: ReaderImageUse, policy: ResolvedReaderImagePolicy): Boolean = when (use) {
    ReaderImageUse.ZOOM -> policy.allowZoom
    ReaderImageUse.SHARE -> policy.allowSharing
  }

  fun validateSourceHandle(value: String): String {
    require(value.isNotEmpty() && value.length <= MAXIMUM_SOURCE_HANDLE_UTF16_UNITS)
    return value
  }
}
