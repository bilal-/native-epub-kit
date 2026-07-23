package com.bilal.nativeepubkit

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import kotlin.math.abs
import org.json.JSONArray
import org.json.JSONObject

internal class NavigationUnitBoundaryPolicyException(message: String) :
  IllegalArgumentException(message)

internal data class ReaderNavigationBoundaryLocation(
  val href: String,
  val fragments: List<String>,
  val position: Int?,
  val totalProgression: Double?,
)

internal data class ReaderNavigationUnitBoundary(
  val endPositionExclusive: Int?,
  val endTotalProgression: Double?,
  val href: String,
  val id: String,
  val startPosition: Int?,
  val startTotalProgression: Double?,
)

internal data class ReaderNavigationUnitBoundaryConfiguration(
  val generation: Long,
  val instanceId: String,
  val precision: String,
  val units: List<ReaderNavigationUnitBoundary>,
) {
  init {
    if (generation < 0 || instanceId.isEmpty()) {
      throw NavigationUnitBoundaryPolicyException("navigation-unit identity is invalid")
    }
    if (precision !in setOf("continuous", "position", "resource") || units.isEmpty()) {
      throw NavigationUnitBoundaryPolicyException("navigation-unit precision is invalid")
    }
    if (units.map { it.id }.toSet().size != units.size) {
      throw NavigationUnitBoundaryPolicyException("navigation-unit IDs must be unique")
    }
    units.forEach { unit ->
      if (unit.id.isEmpty() || unit.href.isEmpty()) {
        throw NavigationUnitBoundaryPolicyException("navigation-unit identity is empty")
      }
      val startPosition = unit.startPosition
      val endPosition = unit.endPositionExclusive
      if (startPosition != null && endPosition != null && (startPosition < 1 || endPosition <= startPosition)) {
        throw NavigationUnitBoundaryPolicyException(
          "navigation-unit position interval is invalid"
        )
      }
      val startProgression = unit.startTotalProgression
      val endProgression = unit.endTotalProgression
      if (
        startProgression != null &&
        endProgression != null &&
        (
          !startProgression.isFinite() ||
            !endProgression.isFinite() ||
            startProgression !in 0.0..1.0 ||
            endProgression !in 0.0..1.0 ||
            endProgression <= startProgression
          )
      ) {
        throw NavigationUnitBoundaryPolicyException(
          "navigation-unit progression interval is invalid"
        )
      }
    }
  }

  companion object {
    fun decode(jsonString: String): ReaderNavigationUnitBoundaryConfiguration {
      val objectValue = runCatching { JSONObject(jsonString) }.getOrElse {
        throw NavigationUnitBoundaryPolicyException(
          "navigation-unit boundary configuration is invalid"
        )
      }
      val unitsValue = objectValue.opt("units") as? JSONArray
        ?: throw NavigationUnitBoundaryPolicyException(
          "navigation-unit boundary configuration is invalid"
        )
      return ReaderNavigationUnitBoundaryConfiguration(
        generation = objectValue.requiredLong("generation"),
        instanceId = objectValue.requiredString("instanceId"),
        precision = objectValue.requiredString("precision"),
        units = (0 until unitsValue.length()).map { index ->
          val unit = unitsValue.opt(index) as? JSONObject
            ?: throw NavigationUnitBoundaryPolicyException("navigation-unit entry is invalid")
          ReaderNavigationUnitBoundary(
            endPositionExclusive = unit.optionalInt("endPositionExclusive"),
            endTotalProgression = unit.optionalDouble("endTotalProgression"),
            href = unit.requiredString("href"),
            id = unit.requiredString("id"),
            startPosition = unit.optionalInt("startPosition"),
            startTotalProgression = unit.optionalDouble("startTotalProgression"),
          )
        },
      )
    }
  }
}

internal data class ReaderNavigationUnitBoundaryMatch(
  val index: Int,
  val precision: String,
  val unit: ReaderNavigationUnitBoundary,
)

internal object NavigationUnitBoundaryPolicy {
  private const val PROGRESSION_EPSILON = 1e-9

  fun match(
    configuration: ReaderNavigationUnitBoundaryConfiguration,
    location: ReaderNavigationBoundaryLocation,
    preferredUnitId: String? = null,
  ): ReaderNavigationUnitBoundaryMatch? = when (configuration.precision) {
    "continuous" -> continuous(configuration.units, location)
      ?: position(configuration.units, location)
      ?: resource(configuration.units, location, preferredUnitId)
    "position" -> position(configuration.units, location)
      ?: resource(configuration.units, location, preferredUnitId)
    else -> resource(configuration.units, location, preferredUnitId)
  }

  private fun continuous(
    units: List<ReaderNavigationUnitBoundary>,
    location: ReaderNavigationBoundaryLocation,
  ): ReaderNavigationUnitBoundaryMatch? {
    val value = location.totalProgression?.takeIf { it.isFinite() } ?: return null
    val exact = units.indexOfFirst { unit ->
      unit.startTotalProgression?.let { abs(it - value) <= PROGRESSION_EPSILON } == true
    }
    val index = if (exact >= 0) exact else units.indexOfFirst { unit ->
      val start = unit.startTotalProgression ?: return@indexOfFirst false
      val end = unit.endTotalProgression ?: return@indexOfFirst false
      val publicationEnd =
        abs(value - 1.0) <= PROGRESSION_EPSILON && abs(end - 1.0) <= PROGRESSION_EPSILON
      end > start && value >= start && (value < end || publicationEnd)
    }
    return units.match(index, "continuous")
  }

  private fun position(
    units: List<ReaderNavigationUnitBoundary>,
    location: ReaderNavigationBoundaryLocation,
  ): ReaderNavigationUnitBoundaryMatch? {
    val value = location.position ?: return null
    val exact = units.indexOfFirst { it.startPosition == value }
    val index = if (exact >= 0) exact else units.indexOfFirst { unit ->
      val start = unit.startPosition ?: return@indexOfFirst false
      val end = unit.endPositionExclusive ?: return@indexOfFirst false
      value >= start && value < end
    }
    return units.match(index, "position")
  }

  private fun resource(
    units: List<ReaderNavigationUnitBoundary>,
    location: ReaderNavigationBoundaryLocation,
    preferredUnitId: String?,
  ): ReaderNavigationUnitBoundaryMatch? {
    location.fragments.firstOrNull()?.let { fragment ->
      val target = normalizedTarget(
        "${normalizedResource(location.href)}#${normalizedFragment(fragment)}"
      )
      val exact = units.indexOfFirst { normalizedTarget(it.href) == target }
      units.match(exact, "resource")?.let { return it }
    }
    val resource = normalizedResource(location.href)
    val matching = units.indices.filter { normalizedResource(units[it].href) == resource }
    if (preferredUnitId != null) {
      val preferred = matching.firstOrNull { units[it].id == preferredUnitId }
      if (preferred != null) return units.match(preferred, "resource")
    }
    return matching.firstOrNull()?.let { units.match(it, "resource") }
  }

  private fun List<ReaderNavigationUnitBoundary>.match(
    index: Int,
    precision: String,
  ): ReaderNavigationUnitBoundaryMatch? =
    getOrNull(index)?.let { ReaderNavigationUnitBoundaryMatch(index, precision, it) }

  private fun normalizedResource(href: String): String {
    val withoutFragment = href.substringBefore('#')
    val withoutQuery = withoutFragment.substringBefore('?')
    val decoded = decodePercent(withoutQuery)
    val segments = mutableListOf<String>()
    Normalizer.normalize(decoded, Normalizer.Form.NFC).split('/').forEach { segment ->
      when (segment) {
        "", "." -> Unit
        ".." -> if (segments.isNotEmpty()) segments.removeAt(segments.lastIndex)
        else -> segments += segment
      }
    }
    return segments.joinToString("/")
  }

  private fun normalizedFragment(fragment: String): String =
    Normalizer.normalize(decodePercent(fragment), Normalizer.Form.NFC)

  private fun normalizedTarget(href: String): String {
    val resource = normalizedResource(href)
    if (!href.contains('#')) return resource
    return "$resource#${normalizedFragment(href.substringAfter('#'))}"
  }

  private fun decodePercent(value: String): String = runCatching {
    URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8)
  }.getOrDefault(value)
}

private fun JSONObject.requiredString(key: String): String =
  (opt(key) as? String)
    ?: throw NavigationUnitBoundaryPolicyException("$key must be a string")

private fun JSONObject.requiredLong(key: String): Long =
  (opt(key) as? Number)?.toLong()
    ?: throw NavigationUnitBoundaryPolicyException("$key must be an integer")

private fun JSONObject.optionalInt(key: String): Int? {
  if (!has(key) || isNull(key)) return null
  val number = opt(key) as? Number
    ?: throw NavigationUnitBoundaryPolicyException("$key must be an integer")
  val value = number.toDouble()
  if (!value.isFinite() || value % 1.0 != 0.0 || value !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
    throw NavigationUnitBoundaryPolicyException("$key must be an integer")
  }
  return value.toInt()
}

private fun JSONObject.optionalDouble(key: String): Double? {
  if (!has(key) || isNull(key)) return null
  return (opt(key) as? Number)?.toDouble()
    ?: throw NavigationUnitBoundaryPolicyException("$key must be a number")
}
