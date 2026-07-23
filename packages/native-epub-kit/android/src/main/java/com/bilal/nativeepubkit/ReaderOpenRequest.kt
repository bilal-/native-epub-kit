package com.bilal.nativeepubkit

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import org.readium.r2.shared.publication.Locator

internal enum class ReaderOpenRequestErrorKind {
  INVALID_LOCATOR,
  INVALID_NAVIGATION_POLICY,
  INVALID_PREFERENCES,
  INVALID_SELECTION_ACTIONS,
  INVALID_SOURCE,
  INVALID_TYPOGRAPHY_PROFILE,
}

internal class ReaderOpenRequestValidationException(
  val kind: ReaderOpenRequestErrorKind,
) : IllegalArgumentException(kind.name)

internal data class ReaderOpenRequest(
  val initialLocator: Locator?,
  val navigationPolicy: ResolvedReaderNavigationPolicy,
  val navigationUnitBoundaryKey: String?,
  val navigationUnitBoundariesRequired: Boolean,
  val preferences: ResolvedReaderPreferences,
  val selectionActions: List<ResolvedNativeSelectionAction>,
  val source: SharedPublicationSourceRecord,
  val sourceFingerprint: String,
  val typographyProfile: ResolvedTypographyProfile?,
)

internal object ReaderOpenRequestCodec {
  fun decode(
    jsonString: String,
    availableFontFamilies: Set<String>? = null,
  ): ReaderOpenRequest {
    val request = runCatching {
      JSONTokener(jsonString).nextValue() as? JSONObject
    }.getOrNull() ?: throw ReaderOpenRequestValidationException(
      ReaderOpenRequestErrorKind.INVALID_SOURCE
    )
    val sourceJson = request.opt("source") as? JSONObject
      ?: throw ReaderOpenRequestValidationException(ReaderOpenRequestErrorKind.INVALID_SOURCE)
    val source = runCatching {
      SharedCoreRecordCodec.decode(
        SharedCoreRecordType.PUBLICATION_SOURCE,
        sourceJson,
      ) as SharedPublicationSourceRecord
    }.getOrElse {
      throw ReaderOpenRequestValidationException(ReaderOpenRequestErrorKind.INVALID_SOURCE)
    }
    val initialLocator = if (!request.has("initialLocator") || request.isNull("initialLocator")) {
      null
    } else {
      val locatorJson = request.opt("initialLocator") as? JSONObject
        ?: throw ReaderOpenRequestValidationException(ReaderOpenRequestErrorKind.INVALID_LOCATOR)
      runCatching {
        val record = SharedCoreRecordCodec.decode(
          SharedCoreRecordType.LOCATOR,
          locatorJson,
        ) as SharedLocatorRecord
        Locator.fromJSON(record.json)
          ?: throw SharedRecordValidationException("$", "is not a valid Readium locator")
      }.getOrElse {
        throw ReaderOpenRequestValidationException(ReaderOpenRequestErrorKind.INVALID_LOCATOR)
      }
    }
    val preferences = runCatching {
      ResolvedReaderPreferences.decode(request.opt("preferences"))
    }.getOrElse {
      throw ReaderOpenRequestValidationException(ReaderOpenRequestErrorKind.INVALID_PREFERENCES)
    }
    val selectionActions = runCatching {
      SelectionActionPolicy.resolve(request.opt("selectionActions"))
    }.getOrElse {
      throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_SELECTION_ACTIONS
      )
    }
    val typographyProfile = runCatching {
      when {
        !request.has("typographyProfile") || request.isNull("typographyProfile") -> null
        else -> TypographyProfilePolicy.resolve(
          request.getJSONObject("typographyProfile"),
          availableFontFamilies,
        )
      }
    }.getOrElse {
      throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_TYPOGRAPHY_PROFILE
      )
    }
    val navigationPolicy = runCatching {
      ResolvedReaderNavigationPolicy.decode(request.opt("navigationPolicy"))
    }.getOrElse {
      throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY
      )
    }
    val navigationUnitBoundariesRequired = when {
      !request.has("navigationUnitBoundariesRequired") -> false
      request.opt("navigationUnitBoundariesRequired") is Boolean ->
        request.getBoolean("navigationUnitBoundariesRequired")
      else -> throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY
      )
    }
    val navigationUnitBoundaryKey = when {
      !request.has("navigationUnitBoundaryKey") || request.isNull("navigationUnitBoundaryKey") ->
        null
      request.opt("navigationUnitBoundaryKey") is String ->
        request.getString("navigationUnitBoundaryKey").takeIf { it.isNotEmpty() }
          ?: throw ReaderOpenRequestValidationException(
            ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY
          )
      else -> throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY
      )
    }
    if (navigationUnitBoundariesRequired != (navigationUnitBoundaryKey != null)) {
      throw ReaderOpenRequestValidationException(
        ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY
      )
    }
    return ReaderOpenRequest(
      initialLocator = initialLocator,
      navigationPolicy = navigationPolicy,
      navigationUnitBoundaryKey = navigationUnitBoundaryKey,
      navigationUnitBoundariesRequired = navigationUnitBoundariesRequired,
      preferences = preferences,
      selectionActions = selectionActions,
      source = source,
      sourceFingerprint = canonicalJson(sourceJson),
      typographyProfile = typographyProfile,
    )
  }

  private fun canonicalJson(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(
      prefix = "{",
      postfix = "}",
    ) { key -> "${JSONObject.quote(key)}:${canonicalJson(value.get(key))}" }
    is JSONArray -> (0 until value.length()).joinToString(
      prefix = "[",
      postfix = "]",
    ) { index -> canonicalJson(value.get(index)) }
    is String -> JSONObject.quote(value)
    is Boolean, is Number -> value.toString()
    else -> JSONObject.quote(value.toString())
  }
}
