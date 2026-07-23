package com.bilal.nativeepubkit

import kotlin.math.floor
import org.json.JSONArray
import org.json.JSONObject

internal class SharedRecordValidationException(
  val path: String,
  reason: String,
) : IllegalArgumentException("$path: $reason")

internal enum class SharedPublicationSourceKind(val wireValue: String) {
  FILE("file"),
  CONTENT("content"),
  REMOTE("remote"),
}

internal enum class SharedReadingProgression(val wireValue: String) {
  LTR("ltr"),
  RTL("rtl"),
  TTB("ttb"),
  BTT("btt"),
  AUTO("auto"),
}

internal enum class SharedPublicationLayout(val wireValue: String) {
  REFLOWABLE("reflowable"),
  FIXED("fixed"),
}

internal enum class SharedProgressPrecision(val wireValue: String) {
  CONTINUOUS("continuous"),
  POSITION("position"),
  RESOURCE("resource"),
}

internal enum class SharedNavigationUnitSource(val wireValue: String) {
  TOC("toc"),
  READING_ORDER_FALLBACK("reading-order-fallback"),
}

internal enum class SharedReaderLocationReason(val wireValue: String) {
  INITIAL("initial"),
  USER_SCROLL("user-scroll"),
  USER_PAGE_TURN("user-page-turn"),
  PROGRAMMATIC("programmatic"),
  PREFERENCE_CHANGE("preference-change"),
  RESTORED("restored"),
}

internal enum class SharedReaderSelectionChangeReason(val wireValue: String) {
  STARTED("started"),
  CHANGED("changed"),
  CLEARED("cleared"),
  DISMISSED("dismissed"),
}

internal enum class SharedTextDirection(val wireValue: String) {
  LTR("ltr"),
  RTL("rtl"),
  AUTO("auto"),
}

internal enum class SharedDecorationStyleType(val wireValue: String) {
  HIGHLIGHT("highlight"),
  UNDERLINE("underline"),
  MARGIN_ICON("margin-icon"),
  CUSTOM("custom"),
}

internal enum class SharedFootnoteClassification(val wireValue: String) {
  SEMANTIC("semantic"),
  HEURISTIC("heuristic"),
}

internal enum class SharedReaderLinkKind(val wireValue: String) {
  INTERNAL("internal"),
  EXTERNAL("external"),
  UNSUPPORTED("unsupported"),
}

internal enum class SharedReaderLinkDisposition(val wireValue: String) {
  FOLLOWED("followed"),
  INTERCEPTED("intercepted"),
  BLOCKED("blocked"),
}

internal enum class SharedReaderImageSourceKind(val wireValue: String) {
  PUBLICATION_RESOURCE("publication-resource"),
  INLINE_SVG("inline-svg"),
  EXTERNAL("external"),
}

internal enum class SharedReaderImageUnresolvedReason(val wireValue: String) {
  EXTERNAL_RESOURCE("external-resource"),
  RESOURCE_NOT_FOUND("resource-not-found"),
  SOURCE_TOO_LARGE("source-too-large"),
  UNSUPPORTED_SOURCE("unsupported-source"),
}

internal enum class SharedNativePlatform(val wireValue: String) {
  IOS("ios"),
  ANDROID("android"),
}

internal enum class SharedReaderErrorCode(val wireValue: String) {
  SOURCE_NOT_FOUND("SOURCE_NOT_FOUND"),
  SOURCE_PERMISSION_DENIED("SOURCE_PERMISSION_DENIED"),
  UNSUPPORTED_FORMAT("UNSUPPORTED_FORMAT"),
  PUBLICATION_OPEN_FAILED("PUBLICATION_OPEN_FAILED"),
  PUBLICATION_PROTECTED("PUBLICATION_PROTECTED"),
  NAVIGATOR_CREATION_FAILED("NAVIGATOR_CREATION_FAILED"),
  RESOURCE_LOAD_FAILED("RESOURCE_LOAD_FAILED"),
  INVALID_LOCATOR("INVALID_LOCATOR"),
  NAVIGATION_FAILED("NAVIGATION_FAILED"),
  SEARCH_FAILED("SEARCH_FAILED"),
  READER_NOT_READY("READER_NOT_READY"),
  READER_DESTROYED("READER_DESTROYED"),
  TYPOGRAPHY_CONFIGURATION_FAILED("TYPOGRAPHY_CONFIGURATION_FAILED"),
  NATIVE_INVARIANT_VIOLATION("NATIVE_INVARIANT_VIOLATION"),
}

internal enum class SharedReaderErrorPhase(val wireValue: String) {
  SOURCE("source"),
  OPEN("open"),
  RENDER("render"),
  NAVIGATE("navigate"),
  SEARCH("search"),
  RESOURCE("resource"),
  CLOSE("close"),
}

internal enum class SharedCoreRecordType(val wireValue: String) {
  PUBLICATION_SOURCE("publicationSource"),
  LOCATOR("locator"),
  READER_GEOMETRY("readerGeometry"),
  PUBLICATION_SUMMARY("publicationSummary"),
  NAVIGATION_UNIT("navigationUnit"),
  READER_LOCATION_EVENT("readerLocationEvent"),
  READER_SELECTION("readerSelection"),
  READER_SELECTION_CHANGE_EVENT("readerSelectionChangeEvent"),
  READER_SELECTION_ACTION_EVENT("readerSelectionActionEvent"),
  READER_DECORATION("readerDecoration"),
  READER_DECORATION_ACTIVATION_EVENT("readerDecorationActivationEvent"),
  FOOTNOTE_EVENT("footnoteEvent"),
  READER_LINK_EVENT("readerLinkEvent"),
  READER_IMAGE_ACTIVATION_EVENT("readerImageActivationEvent"),
  READER_ERROR("readerError");

  companion object {
    fun fromWireValue(value: String): SharedCoreRecordType =
      entries.firstOrNull { it.wireValue == value }
        ?: throw SharedRecordValidationException("$/recordType", "has unsupported value $value")
  }
}

internal object SharedCoreRecordContract {
  val recordTypes = SharedCoreRecordType.entries.map { it.wireValue }

  val enumValues: Map<String, List<String>> = linkedMapOf(
    "publicationSourceKind" to SharedPublicationSourceKind.entries.map { it.wireValue },
    "readingProgression" to SharedReadingProgression.entries.map { it.wireValue },
    "publicationLayout" to SharedPublicationLayout.entries.map { it.wireValue },
    "progressPrecision" to SharedProgressPrecision.entries.map { it.wireValue },
    "navigationUnitSource" to SharedNavigationUnitSource.entries.map { it.wireValue },
    "readerLocationReason" to SharedReaderLocationReason.entries.map { it.wireValue },
    "readerSelectionChangeReason" to SharedReaderSelectionChangeReason.entries.map { it.wireValue },
    "textDirection" to SharedTextDirection.entries.map { it.wireValue },
    "decorationStyle" to SharedDecorationStyleType.entries.map { it.wireValue },
    "footnoteClassification" to SharedFootnoteClassification.entries.map { it.wireValue },
    "readerLinkKind" to SharedReaderLinkKind.entries.map { it.wireValue },
    "readerLinkDisposition" to SharedReaderLinkDisposition.entries.map { it.wireValue },
    "readerImageSourceKind" to SharedReaderImageSourceKind.entries.map { it.wireValue },
    "readerImageUnresolvedReason" to SharedReaderImageUnresolvedReason.entries.map { it.wireValue },
    "platform" to SharedNativePlatform.entries.map { it.wireValue },
    "readerErrorCode" to SharedReaderErrorCode.entries.map { it.wireValue },
    "readerErrorPhase" to SharedReaderErrorPhase.entries.map { it.wireValue },
  )

  val units = linkedMapOf(
    "geometry" to "logical-points-ios-density-independent-pixels-android",
    "progression" to "closed-zero-to-one",
    "position" to "one-based-positive-integer",
    "generation" to "zero-based-safe-integer",
    "sequence" to "zero-based-safe-integer",
  )

  val nullability = linkedMapOf(
    "optionalFields" to "omitted",
    "locatorTitle" to "string-or-null",
    "jsonExtensionValues" to "may-be-null",
  )
}

internal sealed interface SharedCoreRecord {
  val json: JSONObject
}

internal data class SharedPublicationSourceRecord(
  override val json: JSONObject,
  val kind: SharedPublicationSourceKind,
) : SharedCoreRecord

internal data class SharedLocatorRecord(
  override val json: JSONObject,
  val href: String,
  val type: String,
) : SharedCoreRecord

internal data class SharedReaderGeometryRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedPublicationSummaryRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedNavigationUnitRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderLocationEventRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderSelectionRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderSelectionChangeEventRecord(
  override val json: JSONObject,
) : SharedCoreRecord
internal data class SharedReaderSelectionActionEventRecord(
  override val json: JSONObject,
) : SharedCoreRecord
internal data class SharedReaderDecorationRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderDecorationActivationEventRecord(
  override val json: JSONObject,
) : SharedCoreRecord
internal data class SharedFootnoteEventRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderLinkEventRecord(override val json: JSONObject) : SharedCoreRecord
internal data class SharedReaderImageActivationEventRecord(
  override val json: JSONObject,
) : SharedCoreRecord

internal data class SharedReaderErrorRecord(
  override val json: JSONObject,
  val code: SharedReaderErrorCode,
  val phase: SharedReaderErrorPhase,
  val message: String,
  val recoverable: Boolean,
) : SharedCoreRecord

private object SharedRecordValidator {
  private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

  private fun required(value: JSONObject, key: String, path: String): Any {
    if (!value.has(key)) throw SharedRecordValidationException("$path/$key", "is required")
    return value.get(key)
  }

  private fun string(value: Any, path: String, allowEmpty: Boolean = false): String {
    if (value !is String || (!allowEmpty && value.isEmpty())) {
      throw SharedRecordValidationException(
        path,
        if (allowEmpty) "must be a string" else "must be a non-empty string",
      )
    }
    return value
  }

  private fun boolean(value: Any, path: String): Boolean =
    value as? Boolean ?: throw SharedRecordValidationException(path, "must be a boolean")

  private fun number(value: Any, path: String): Double {
    val result = (value as? Number)?.toDouble()
      ?: throw SharedRecordValidationException(path, "must be a finite number")
    if (!result.isFinite()) throw SharedRecordValidationException(path, "must be a finite number")
    return result
  }

  private fun integer(value: Any, path: String, minimum: Long = 0): Long {
    val numeric = number(value, path)
    if (
      floor(numeric) != numeric ||
      numeric < minimum.toDouble() ||
      numeric > MAX_SAFE_INTEGER.toDouble()
    ) {
      throw SharedRecordValidationException(path, "must be a safe integer >= $minimum")
    }
    return numeric.toLong()
  }

  private fun progression(value: Any, path: String): Double {
    val result = number(value, path)
    if (result !in 0.0..1.0) {
      throw SharedRecordValidationException(path, "must be within 0...1")
    }
    return result
  }

  private fun obj(value: Any, path: String): JSONObject =
    value as? JSONObject ?: throw SharedRecordValidationException(path, "must be an object")

  private fun array(value: Any, path: String): JSONArray =
    value as? JSONArray ?: throw SharedRecordValidationException(path, "must be an array")

  private fun stringArray(value: Any, path: String): List<String> {
    val values = array(value, path)
    return (0 until values.length()).map { index -> string(values.get(index), "$path/$index") }
  }

  private fun enumString(value: Any, allowed: Set<String>, path: String): String {
    val result = string(value, path)
    if (result !in allowed) {
      throw SharedRecordValidationException(path, "has unsupported value $result")
    }
    return result
  }

  private fun optionalString(value: JSONObject, key: String, path: String) {
    if (value.has(key)) string(value.get(key), "$path/$key")
  }

  private fun optionalBoolean(value: JSONObject, key: String, path: String) {
    if (value.has(key)) boolean(value.get(key), "$path/$key")
  }

  private fun optionalProgression(value: JSONObject, key: String, path: String) {
    if (value.has(key)) progression(value.get(key), "$path/$key")
  }

  private fun optionalPositiveInteger(value: JSONObject, key: String, path: String) {
    if (value.has(key)) integer(value.get(key), "$path/$key", 1)
  }

  fun publicationSource(value: JSONObject, path: String) {
    val kind = enumString(
      required(value, "kind", path),
      SharedPublicationSourceKind.entries.map { it.wireValue }.toSet(),
      "$path/kind",
    )
    if (kind == SharedPublicationSourceKind.REMOTE.wireValue) {
      string(required(value, "url", path), "$path/url")
      if (value.has("headers")) {
        val headers = obj(value.get("headers"), "$path/headers")
        for (key in headers.keys()) string(headers.get(key), "$path/headers/$key", true)
      }
    } else {
      string(required(value, "uri", path), "$path/uri")
    }
  }

  fun locator(value: JSONObject, path: String) {
    string(required(value, "href", path), "$path/href")
    string(required(value, "type", path), "$path/type")
    if (value.has("title") && !value.isNull("title")) {
      string(value.get("title"), "$path/title", true)
    }
    if (value.has("locations")) {
      val locations = obj(value.get("locations"), "$path/locations")
      if (locations.has("fragments")) {
        stringArray(locations.get("fragments"), "$path/locations/fragments")
      }
      optionalProgression(locations, "progression", "$path/locations")
      optionalProgression(locations, "totalProgression", "$path/locations")
      optionalPositiveInteger(locations, "position", "$path/locations")
    }
    if (value.has("text")) {
      val text = obj(value.get("text"), "$path/text")
      optionalString(text, "before", "$path/text")
      optionalString(text, "highlight", "$path/text")
      optionalString(text, "after", "$path/text")
    }
  }

  private fun rect(value: JSONObject, path: String) {
    number(required(value, "x", path), "$path/x")
    number(required(value, "y", path), "$path/y")
    val width = number(required(value, "width", path), "$path/width")
    val height = number(required(value, "height", path), "$path/height")
    if (width < 0) throw SharedRecordValidationException("$path/width", "must be >= 0")
    if (height < 0) throw SharedRecordValidationException("$path/height", "must be >= 0")
  }

  fun geometry(value: JSONObject, path: String) {
    val coordinateSpace = string(required(value, "coordinateSpace", path), "$path/coordinateSpace")
    if (coordinateSpace != "reader-view-and-window-v1") {
      throw SharedRecordValidationException(
        "$path/coordinateSpace",
        "must be reader-view-and-window-v1",
      )
    }
    val viewport = obj(required(value, "viewport", path), "$path/viewport")
    val width = number(required(viewport, "width", "$path/viewport"), "$path/viewport/width")
    val height = number(required(viewport, "height", "$path/viewport"), "$path/viewport/height")
    if (width <= 0 || height <= 0) {
      throw SharedRecordValidationException("$path/viewport", "width and height must be > 0")
    }
    if (value.has("viewRect")) rect(obj(value.get("viewRect"), "$path/viewRect"), "$path/viewRect")
    if (value.has("visibleViewRect")) {
      rect(obj(value.get("visibleViewRect"), "$path/visibleViewRect"), "$path/visibleViewRect")
    }
    if (value.has("windowRect")) {
      rect(obj(value.get("windowRect"), "$path/windowRect"), "$path/windowRect")
    }
    if (value.has("visibleWindowRect")) {
      rect(
        obj(value.get("visibleWindowRect"), "$path/visibleWindowRect"),
        "$path/visibleWindowRect",
      )
    }
  }

  private fun contributor(value: JSONObject, path: String) {
    string(required(value, "name", path), "$path/name")
    optionalString(value, "identifier", path)
    optionalString(value, "sortAs", path)
    if (value.has("roles")) stringArray(value.get("roles"), "$path/roles")
  }

  private fun link(value: JSONObject, path: String, depth: Int = 0) {
    if (depth > 256) throw SharedRecordValidationException(path, "link nesting exceeds 256 levels")
    string(required(value, "href", path), "$path/href")
    optionalString(value, "title", path)
    optionalString(value, "type", path)
    if (value.has("rel")) stringArray(value.get("rel"), "$path/rel")
    if (value.has("properties")) obj(value.get("properties"), "$path/properties")
    val children = array(required(value, "children", path), "$path/children")
    for (index in 0 until children.length()) {
      link(obj(children.get(index), "$path/children/$index"), "$path/children/$index", depth + 1)
    }
  }

  private fun capabilities(value: JSONObject, path: String) {
    for (key in listOf("customFonts", "decorations", "footnotes", "images", "search", "selection")) {
      boolean(required(value, key, path), "$path/$key")
    }
    enumString(
      required(value, "progressPrecision", path),
      SharedProgressPrecision.entries.map { it.wireValue }.toSet(),
      "$path/progressPrecision",
    )
    stringArray(required(value, "warnings", path), "$path/warnings")
  }

  fun publicationSummary(value: JSONObject, path: String) {
    string(required(value, "title", path), "$path/title")
    optionalString(value, "identifier", path)
    optionalString(value, "subtitle", path)
    if (value.has("readingProgression")) {
      enumString(
        value.get("readingProgression"),
        SharedReadingProgression.entries.map { it.wireValue }.toSet(),
        "$path/readingProgression",
      )
    }
    enumString(
      required(value, "layout", path),
      SharedPublicationLayout.entries.map { it.wireValue }.toSet(),
      "$path/layout",
    )
    stringArray(required(value, "languages", path), "$path/languages")
    val authors = array(required(value, "authors", path), "$path/authors")
    for (index in 0 until authors.length()) {
      contributor(obj(authors.get(index), "$path/authors/$index"), "$path/authors/$index")
    }
    for (key in listOf("tableOfContents", "readingOrder")) {
      val links = array(required(value, key, path), "$path/$key")
      for (index in 0 until links.length()) {
        link(obj(links.get(index), "$path/$key/$index"), "$path/$key/$index")
      }
    }
    val positions = array(required(value, "positions", path), "$path/positions")
    for (index in 0 until positions.length()) {
      locator(obj(positions.get(index), "$path/positions/$index"), "$path/positions/$index")
    }
    capabilities(obj(required(value, "capabilities", path), "$path/capabilities"), "$path/capabilities")
  }

  fun navigationUnit(value: JSONObject, path: String) {
    for (key in listOf("id", "title", "href")) string(required(value, key, path), "$path/$key")
    integer(required(value, "depth", path), "$path/depth")
    enumString(
      required(value, "source", path),
      SharedNavigationUnitSource.entries.map { it.wireValue }.toSet(),
      "$path/source",
    )
    stringArray(required(value, "childIds", path), "$path/childIds")
    optionalString(value, "parentId", path)
    locator(obj(required(value, "startLocator", path), "$path/startLocator"), "$path/startLocator")
    if (value.has("endLocator")) {
      locator(obj(value.get("endLocator"), "$path/endLocator"), "$path/endLocator")
    }
    optionalPositiveInteger(value, "startPosition", path)
    optionalPositiveInteger(value, "endPositionExclusive", path)
    optionalProgression(value, "startTotalProgression", path)
    optionalProgression(value, "endTotalProgression", path)
    if (value.has("startPosition") && value.has("endPositionExclusive")) {
      val start = integer(value.get("startPosition"), "$path/startPosition", 1)
      val end = integer(value.get("endPositionExclusive"), "$path/endPositionExclusive", 1)
      if (end <= start) {
        throw SharedRecordValidationException(
          "$path/endPositionExclusive",
          "must be greater than startPosition",
        )
      }
    }
  }

  fun locationEvent(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    integer(required(value, "sequence", path), "$path/sequence")
    locator(obj(required(value, "locator", path), "$path/locator"), "$path/locator")
    enumString(
      required(value, "reason", path),
      SharedReaderLocationReason.entries.map { it.wireValue }.toSet(),
      "$path/reason",
    )
    enumString(
      required(value, "precision", path),
      SharedProgressPrecision.entries.map { it.wireValue }.toSet(),
      "$path/precision",
    )
    optionalProgression(value, "chapterProgress", path)
    optionalProgression(value, "overallProgress", path)
    optionalPositiveInteger(value, "position", path)
    optionalPositiveInteger(value, "totalPositions", path)
    if (value.has("navigationUnit")) {
      navigationUnit(obj(value.get("navigationUnit"), "$path/navigationUnit"), "$path/navigationUnit")
    }
    if (value.has("visibleRange")) {
      val range = obj(value.get("visibleRange"), "$path/visibleRange")
      locator(obj(required(range, "start", "$path/visibleRange"), "$path/visibleRange/start"), "$path/visibleRange/start")
      locator(obj(required(range, "end", "$path/visibleRange"), "$path/visibleRange/end"), "$path/visibleRange/end")
    }
  }

  fun selection(value: JSONObject, path: String) {
    locator(obj(required(value, "locator", path), "$path/locator"), "$path/locator")
    string(required(value, "text", path), "$path/text", true)
    optionalString(value, "language", path)
    optionalString(value, "navigationUnitId", path)
    optionalBoolean(value, "copyAllowed", path)
    optionalBoolean(value, "truncated", path)
    if (value.has("direction")) {
      enumString(
        value.get("direction"),
        SharedTextDirection.entries.map { it.wireValue }.toSet(),
        "$path/direction",
      )
    }
    if (value.has("geometry")) geometry(obj(value.get("geometry"), "$path/geometry"), "$path/geometry")
  }

  private fun selectionSnapshot(value: JSONObject, path: String) {
    selection(value, path)
    boolean(required(value, "copyAllowed", path), "$path/copyAllowed")
    boolean(required(value, "truncated", path), "$path/truncated")
  }

  private fun selectionIdentity(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    integer(required(value, "sequence", path), "$path/sequence")
    boolean(required(value, "handlesActive", path), "$path/handlesActive")
    enumString(
      required(value, "platform", path),
      SharedNativePlatform.entries.map { it.wireValue }.toSet(),
      "$path/platform",
    )
  }

  fun selectionChangeEvent(value: JSONObject, path: String) {
    selectionIdentity(value, path)
    val reason = enumString(
      required(value, "reason", path),
      SharedReaderSelectionChangeReason.entries.map { it.wireValue }.toSet(),
      "$path/reason",
    )
    val selection = required(value, "selection", path)
    val ended = reason == SharedReaderSelectionChangeReason.CLEARED.wireValue ||
      reason == SharedReaderSelectionChangeReason.DISMISSED.wireValue
    if (ended) {
      if (selection !== JSONObject.NULL) {
        throw SharedRecordValidationException(
          "$path/selection",
          "must be null when reason is $reason",
        )
      }
      if (boolean(required(value, "handlesActive", path), "$path/handlesActive")) {
        throw SharedRecordValidationException(
          "$path/handlesActive",
          "must be false when reason is $reason",
        )
      }
    } else {
      if (selection === JSONObject.NULL) {
        throw SharedRecordValidationException(
          "$path/selection",
          "must be active when reason is $reason",
        )
      }
      selectionSnapshot(obj(selection, "$path/selection"), "$path/selection")
    }
  }

  fun selectionActionEvent(value: JSONObject, path: String) {
    selectionIdentity(value, path)
    string(required(value, "actionId", path), "$path/actionId")
    selectionSnapshot(
      obj(required(value, "selection", path), "$path/selection"),
      "$path/selection",
    )
  }

  fun decoration(value: JSONObject, path: String) {
    string(required(value, "id", path), "$path/id")
    locator(obj(required(value, "locator", path), "$path/locator"), "$path/locator")
    val style = obj(required(value, "style", path), "$path/style")
    val type = enumString(
      required(style, "type", "$path/style"),
      SharedDecorationStyleType.entries.map { it.wireValue }.toSet(),
      "$path/style/type",
    )
    if (type == "highlight" || type == "underline") {
      string(required(style, "tint", "$path/style"), "$path/style/tint")
    }
    if ((type == "highlight" || type == "underline") && style.has("isActive")) {
      boolean(style.get("isActive"), "$path/style/isActive")
    }
    if (type == "margin-icon") {
      string(required(style, "asset", "$path/style"), "$path/style/asset")
      optionalString(style, "tint", "$path/style")
    }
    if (type == "custom") {
      string(required(style, "template", "$path/style"), "$path/style/template")
    }
  }

  fun decorationActivationEvent(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    integer(required(value, "sequence", path), "$path/sequence")
    enumString(
      required(value, "platform", path),
      SharedNativePlatform.entries.map { it.wireValue }.toSet(),
      "$path/platform",
    )
    string(required(value, "group", path), "$path/group")
    decoration(obj(required(value, "decoration", path), "$path/decoration"), "$path/decoration")
    if (value.has("geometry")) {
      geometry(obj(value.get("geometry"), "$path/geometry"), "$path/geometry")
    }
  }

  fun footnote(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    enumString(
      required(value, "platform", path),
      SharedNativePlatform.entries.map { it.wireValue }.toSet(),
      "$path/platform",
    )
    string(required(value, "href", path), "$path/href")
    string(required(value, "text", path), "$path/text", true)
    boolean(required(value, "truncated", path), "$path/truncated")
    enumString(
      required(value, "classification", path),
      SharedFootnoteClassification.entries.map { it.wireValue }.toSet(),
      "$path/classification",
    )
    locator(obj(required(value, "sourceLocator", path), "$path/sourceLocator"), "$path/sourceLocator")
    if (value.has("targetLocator")) {
      locator(obj(value.get("targetLocator"), "$path/targetLocator"), "$path/targetLocator")
    }
    for (key in listOf("id", "referrer", "contentType", "html", "language")) {
      optionalString(value, key, path)
    }
    if (value.has("direction")) {
      enumString(
        value.get("direction"),
        SharedTextDirection.entries.map { it.wireValue }.toSet(),
        "$path/direction",
      )
    }
    if (value.has("geometry")) geometry(obj(value.get("geometry"), "$path/geometry"), "$path/geometry")
  }

  fun readerLink(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    enumString(
      required(value, "platform", path),
      SharedNativePlatform.entries.map { it.wireValue }.toSet(),
      "$path/platform",
    )
    string(required(value, "href", path), "$path/href")
    enumString(
      required(value, "kind", path),
      SharedReaderLinkKind.entries.map { it.wireValue }.toSet(),
      "$path/kind",
    )
    enumString(
      required(value, "disposition", path),
      SharedReaderLinkDisposition.entries.map { it.wireValue }.toSet(),
      "$path/disposition",
    )
    locator(obj(required(value, "sourceLocator", path), "$path/sourceLocator"), "$path/sourceLocator")
    if (value.has("targetLocator")) {
      locator(obj(value.get("targetLocator"), "$path/targetLocator"), "$path/targetLocator")
    }
    for (key in listOf("contentType", "referrer", "scheme")) optionalString(value, key, path)
    if (value.has("geometry")) geometry(obj(value.get("geometry"), "$path/geometry"), "$path/geometry")
  }

  fun readerImageActivation(value: JSONObject, path: String) {
    string(required(value, "instanceId", path), "$path/instanceId")
    integer(required(value, "generation", path), "$path/generation")
    integer(required(value, "sequence", path), "$path/sequence")
    enumString(
      required(value, "platform", path),
      SharedNativePlatform.entries.map { it.wireValue }.toSet(),
      "$path/platform",
    )
    locator(obj(required(value, "locator", path), "$path/locator"), "$path/locator")
    for (key in listOf("alt", "caption")) {
      if (value.has(key)) {
        val text = string(value.get(key), "$path/$key", true)
        if (text.length > 4_096) {
          throw SharedRecordValidationException(
            "$path/$key",
            "must contain at most 4096 UTF-16 units",
          )
        }
      }
    }

    val sourcePath = "$path/source"
    val source = obj(required(value, "source", path), sourcePath)
    val kind = enumString(
      required(source, "kind", sourcePath),
      SharedReaderImageSourceKind.entries.map { it.wireValue }.toSet(),
      "$sourcePath/kind",
    )
    val resolvable = boolean(required(source, "resolvable", sourcePath), "$sourcePath/resolvable")
    val href = if (source.has("href")) string(source.get("href"), "$sourcePath/href") else null
    val handle = if (source.has("handle")) {
      string(source.get("handle"), "$sourcePath/handle")
    } else {
      null
    }
    if (href != null && href.length > 4_096) {
      throw SharedRecordValidationException(
        "$sourcePath/href",
        "must contain 1-4096 UTF-16 units",
      )
    }
    if (handle != null && handle.length > 128) {
      throw SharedRecordValidationException(
        "$sourcePath/handle",
        "must contain 1-128 UTF-16 units",
      )
    }
    if (source.has("contentType")) {
      val contentType = string(source.get("contentType"), "$sourcePath/contentType")
        .trim().lowercase()
      if (!contentType.startsWith("image/") || contentType.length > 128) {
        throw SharedRecordValidationException(
          "$sourcePath/contentType",
          "must be a bounded image media type",
        )
      }
    }
    val reason = if (source.has("unresolvedReason")) {
      enumString(
        source.get("unresolvedReason"),
        SharedReaderImageUnresolvedReason.entries.map { it.wireValue }.toSet(),
        "$sourcePath/unresolvedReason",
      )
    } else {
      null
    }
    if (resolvable) {
      if (handle == null) {
        throw SharedRecordValidationException(
          "$sourcePath/handle",
          "is required for a resolvable source",
        )
      }
      if (reason != null) {
        throw SharedRecordValidationException(
          "$sourcePath/unresolvedReason",
          "must be omitted when resolvable",
        )
      }
    } else {
      if (handle != null) {
        throw SharedRecordValidationException(
          "$sourcePath/handle",
          "must be omitted when unresolved",
        )
      }
      if (reason == null) {
        throw SharedRecordValidationException(
          "$sourcePath/unresolvedReason",
          "is required when unresolved",
        )
      }
    }
    if (kind == SharedReaderImageSourceKind.PUBLICATION_RESOURCE.wireValue && href == null) {
      throw SharedRecordValidationException(
        "$sourcePath/href",
        "is required for a publication resource",
      )
    }
    if (kind == SharedReaderImageSourceKind.INLINE_SVG.wireValue && href != null) {
      throw SharedRecordValidationException("$sourcePath/href", "must be omitted for inline SVG")
    }
    if (
      kind == SharedReaderImageSourceKind.EXTERNAL.wireValue &&
      (href == null || resolvable || reason != SharedReaderImageUnresolvedReason.EXTERNAL_RESOURCE.wireValue)
    ) {
      throw SharedRecordValidationException(
        sourcePath,
        "external sources must be unresolved with reason external-resource",
      )
    }

    val rightsPath = "$path/rights"
    val rights = obj(required(value, "rights", path), rightsPath)
    boolean(required(rights, "canShare", rightsPath), "$rightsPath/canShare")
    boolean(required(rights, "canZoom", rightsPath), "$rightsPath/canZoom")
    if (value.has("geometry")) {
      geometry(obj(value.get("geometry"), "$path/geometry"), "$path/geometry")
    }
  }

  fun readerError(value: JSONObject, path: String) {
    enumString(
      required(value, "code", path),
      SharedReaderErrorCode.entries.map { it.wireValue }.toSet(),
      "$path/code",
    )
    enumString(
      required(value, "phase", path),
      SharedReaderErrorPhase.entries.map { it.wireValue }.toSet(),
      "$path/phase",
    )
    string(required(value, "message", path), "$path/message")
    boolean(required(value, "recoverable", path), "$path/recoverable")
    optionalString(value, "publicationUri", path)
  }
}

internal object SharedCoreRecordCodec {
  fun decode(type: SharedCoreRecordType, payload: JSONObject): SharedCoreRecord {
    val json = JSONObject(payload.toString())
    return when (type) {
      SharedCoreRecordType.PUBLICATION_SOURCE -> {
        SharedRecordValidator.publicationSource(json, "$")
        SharedPublicationSourceRecord(
          json,
          SharedPublicationSourceKind.entries.first { it.wireValue == json.getString("kind") },
        )
      }
      SharedCoreRecordType.LOCATOR -> {
        SharedRecordValidator.locator(json, "$")
        SharedLocatorRecord(json, json.getString("href"), json.getString("type"))
      }
      SharedCoreRecordType.READER_GEOMETRY -> {
        SharedRecordValidator.geometry(json, "$")
        SharedReaderGeometryRecord(json)
      }
      SharedCoreRecordType.PUBLICATION_SUMMARY -> {
        SharedRecordValidator.publicationSummary(json, "$")
        SharedPublicationSummaryRecord(json)
      }
      SharedCoreRecordType.NAVIGATION_UNIT -> {
        SharedRecordValidator.navigationUnit(json, "$")
        SharedNavigationUnitRecord(json)
      }
      SharedCoreRecordType.READER_LOCATION_EVENT -> {
        SharedRecordValidator.locationEvent(json, "$")
        SharedReaderLocationEventRecord(json)
      }
      SharedCoreRecordType.READER_SELECTION -> {
        SharedRecordValidator.selection(json, "$")
        SharedReaderSelectionRecord(json)
      }
      SharedCoreRecordType.READER_SELECTION_CHANGE_EVENT -> {
        SharedRecordValidator.selectionChangeEvent(json, "$")
        SharedReaderSelectionChangeEventRecord(json)
      }
      SharedCoreRecordType.READER_SELECTION_ACTION_EVENT -> {
        SharedRecordValidator.selectionActionEvent(json, "$")
        SharedReaderSelectionActionEventRecord(json)
      }
      SharedCoreRecordType.READER_DECORATION -> {
        SharedRecordValidator.decoration(json, "$")
        SharedReaderDecorationRecord(json)
      }
      SharedCoreRecordType.READER_DECORATION_ACTIVATION_EVENT -> {
        SharedRecordValidator.decorationActivationEvent(json, "$")
        SharedReaderDecorationActivationEventRecord(json)
      }
      SharedCoreRecordType.FOOTNOTE_EVENT -> {
        SharedRecordValidator.footnote(json, "$")
        SharedFootnoteEventRecord(json)
      }
      SharedCoreRecordType.READER_LINK_EVENT -> {
        SharedRecordValidator.readerLink(json, "$")
        SharedReaderLinkEventRecord(json)
      }
      SharedCoreRecordType.READER_IMAGE_ACTIVATION_EVENT -> {
        SharedRecordValidator.readerImageActivation(json, "$")
        SharedReaderImageActivationEventRecord(json)
      }
      SharedCoreRecordType.READER_ERROR -> {
        SharedRecordValidator.readerError(json, "$")
        SharedReaderErrorRecord(
          json = json,
          code = SharedReaderErrorCode.entries.first { it.wireValue == json.getString("code") },
          phase = SharedReaderErrorPhase.entries.first { it.wireValue == json.getString("phase") },
          message = json.getString("message"),
          recoverable = json.getBoolean("recoverable"),
        )
      }
    }
  }

  fun encode(record: SharedCoreRecord): JSONObject = JSONObject(record.json.toString())
}

internal object SharedReaderErrorMapper {
  fun code(nativeCode: String): SharedReaderErrorCode =
    SharedReaderErrorCode.entries.firstOrNull { it.wireValue == nativeCode }
      ?: if (nativeCode == "NAVIGATOR_RUNTIME_FAILED") {
        SharedReaderErrorCode.RESOURCE_LOAD_FAILED
      } else {
        SharedReaderErrorCode.NATIVE_INVARIANT_VIOLATION
      }

  fun phase(nativePhase: String): SharedReaderErrorPhase =
    SharedReaderErrorPhase.entries.firstOrNull { it.wireValue == nativePhase }
      ?: SharedReaderErrorPhase.RENDER

  fun record(
    nativeCode: String,
    nativePhase: String,
    message: String,
    recoverable: Boolean,
    publicationUri: String? = null,
    nativeDetails: Any? = null,
  ): SharedReaderErrorRecord {
    val stableCode = code(nativeCode)
    val stablePhase = phase(nativePhase)
    val json = JSONObject()
      .put("code", stableCode.wireValue)
      .put("phase", stablePhase.wireValue)
      .put("message", message)
      .put("recoverable", recoverable)
    publicationUri?.let { json.put("publicationUri", it) }

    val needsNativeIdentity =
      stableCode.wireValue != nativeCode || stablePhase.wireValue != nativePhase
    if (needsNativeIdentity) {
      val details = JSONObject()
        .put("nativeCode", nativeCode)
        .put("nativePhase", nativePhase)
      nativeDetails?.let { details.put("details", it) }
      json.put("nativeDetails", details)
    } else if (nativeDetails != null) {
      json.put("nativeDetails", nativeDetails)
    }
    return SharedCoreRecordCodec.decode(
      SharedCoreRecordType.READER_ERROR,
      json,
    ) as SharedReaderErrorRecord
  }
}
