@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.shared.publication.Contributor
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.epub.EpubLayout
import org.readium.r2.shared.publication.presentation.presentation

internal data class PublicationDataSnapshot(
  val info: Map<String, Any?>,
  val positions: List<Map<String, Any?>>,
) {
  fun publicationInfoValue(
    instanceId: String,
    generation: Long,
    mappingDurationMilliseconds: Long,
  ): Map<String, Any?> = buildMap {
    putAll(info)
    put("instanceId", instanceId)
    put("generation", generation)
    @Suppress("UNCHECKED_CAST")
    val capabilities = (info["capabilities"] as? Map<String, Any?>)?.toMutableMap()
      ?: mutableMapOf()
    capabilities["mappingDurationMilliseconds"] = mappingDurationMilliseconds.coerceAtLeast(0)
    put("capabilities", capabilities)
  }

  fun positionsPageValue(
    instanceId: String,
    generation: Long,
    requestedOffset: Int,
    requestedLimit: Int,
  ): Map<String, Any?> {
    val bounds = PublicationDataPolicy.positionPageBounds(
      total = positions.size,
      requestedOffset = requestedOffset,
      requestedLimit = requestedLimit,
    )
    return buildMap {
      put("generation", generation)
      put("instanceId", instanceId)
      bounds.nextOffset?.let { put("nextOffset", it) }
      put("offset", bounds.offset)
      put("positions", positions.subList(bounds.offset, bounds.offset + bounds.count))
      put("total", positions.size)
    }
  }

  fun diagnosticsInput(mappingDurationMilliseconds: Long): ReaderDiagnosticsPublicationInput {
    @Suppress("UNCHECKED_CAST")
    val capabilities = info["capabilities"] as? Map<String, Any?> ?: emptyMap()
    val booleanCapabilities = listOf(
      "customFonts",
      "decorations",
      "footnotes",
      "images",
      "positions",
      "search",
      "selection",
    ).associateWith { capabilities[it] == true }
    return ReaderDiagnosticsPublicationInput(
      layout = info["layout"] as? String ?: "reflowable",
      readingProgression = info["readingProgression"] as? String ?: "auto",
      positionCount = positions.size,
      progressPrecision = capabilities["progressPrecision"] as? String
        ?: if (positions.isEmpty()) "resource" else "position",
      mappingDurationMilliseconds = mappingDurationMilliseconds.coerceAtLeast(0),
      capabilities = booleanCapabilities,
      warnings = (capabilities["warnings"] as? List<*>)?.mapNotNull { it as? String }
        ?: emptyList(),
    )
  }
}

internal object PublicationDataMapper {
  fun map(
    publication: Publication,
    positions: List<Locator>,
    continuousProgressAvailable: Boolean,
  ): PublicationDataSnapshot {
    val metadata = publication.metadata
    val tableOfContents = publication.tableOfContents
    val readingOrder = publication.readingOrder
    return mapNormalized(
      identifier = metadata.identifier,
      title = metadata.title,
      subtitle = metadata.localizedSubtitle?.string,
      authors = metadata.authors.map(::mapContributor),
      languages = metadata.languages,
      readingProgression = metadata.readingProgression?.value,
      tableOfContents = tableOfContents.map { mapLink(it, 0) },
      tableOfContentsShapes = tableOfContents.map(::linkShape),
      readingOrder = readingOrder.map { mapLink(it, 0) },
      readingOrderHrefs = readingOrder.map { it.href.toString() },
      positions = positions.map { it.toJSON().toPublicationValue() },
      fixedLayout = metadata.presentation.layout == EpubLayout.FIXED,
      continuousProgressAvailable = continuousProgressAvailable,
    )
  }

  internal fun mapNormalized(
    identifier: String?,
    title: String?,
    subtitle: String?,
    authors: List<Map<String, Any?>>,
    languages: List<String>,
    readingProgression: String?,
    tableOfContents: List<Map<String, Any?>>,
    tableOfContentsShapes: List<PublicationDataLinkShape>,
    readingOrder: List<Map<String, Any?>>,
    readingOrderHrefs: List<String>,
    positions: List<Map<String, Any?>>,
    fixedLayout: Boolean,
    continuousProgressAvailable: Boolean,
  ): PublicationDataSnapshot {
    val warnings = PublicationDataPolicy.warnings(
      tableOfContents = tableOfContentsShapes,
      readingOrderHrefs = readingOrderHrefs,
      positionCount = positions.size,
      fixedLayout = fixedLayout,
    ).toMutableList()
    if (fixedLayout) warnings.add("android-fixed-layout-image-activation-unsupported")
    val normalizedTitle = title?.trim()?.takeIf { it.isNotEmpty() } ?: run {
      warnings.add(0, "publication-title-missing")
      "Untitled publication"
    }
    val precision = if (continuousProgressAvailable) {
      "continuous"
    } else if (positions.isNotEmpty()) {
      "position"
    } else {
      "resource"
    }
    val capabilities = mapOf(
      "customFonts" to !fixedLayout,
      "decorations" to true,
      "fixedLayout" to fixedLayout,
      "footnotes" to true,
      "images" to !fixedLayout,
      "hasTableOfContents" to tableOfContents.isNotEmpty(),
      "positionPaging" to true,
      "positions" to positions.isNotEmpty(),
      "progressPrecision" to precision,
      "search" to true,
      "selection" to true,
      "warnings" to warnings,
    )
    val info = buildMap<String, Any?> {
      identifier?.takeIf { it.isNotEmpty() }?.let { put("identifier", it) }
      put("title", normalizedTitle)
      subtitle?.takeIf { it.isNotEmpty() }?.let { put("subtitle", it) }
      put("authors", authors)
      put("languages", languages)
      put("readingProgression", readingProgression ?: "auto")
      put("tableOfContents", tableOfContents)
      put("readingOrder", readingOrder)
      put("layout", if (fixedLayout) "fixed" else "reflowable")
      put("positionCount", positions.size)
      put("capabilities", capabilities)
    }
    return PublicationDataSnapshot(info = info, positions = positions)
  }

  private fun mapContributor(contributor: Contributor): Map<String, Any?> = buildMap {
    put("name", contributor.name)
    contributor.identifier?.takeIf { it.isNotEmpty() }?.let { put("identifier", it) }
    contributor.sortAs?.takeIf { it.isNotEmpty() }?.let { put("sortAs", it) }
    if (contributor.roles.isNotEmpty()) put("roles", contributor.roles.sorted())
  }

  private fun mapLink(link: Link, depth: Int): Map<String, Any?> = buildMap {
    put("href", link.href.toString())
    link.title?.takeIf { it.isNotEmpty() }?.let { put("title", it) }
    link.mediaType?.toString()?.takeIf { it.isNotEmpty() }?.let { put("type", it) }
    if (link.rels.isNotEmpty()) put("rel", link.rels.sorted())
    if (link.properties.otherProperties.isNotEmpty()) {
      put("properties", link.properties.toJSON().toPublicationValue())
    }
    put("children", if (depth >= 256) emptyList() else link.children.map { mapLink(it, depth + 1) })
  }

  private fun linkShape(link: Link): PublicationDataLinkShape = PublicationDataLinkShape(
    href = link.href.toString(),
    children = link.children.map(::linkShape),
  )
}

private fun JSONObject.toPublicationValue(): Map<String, Any?> = buildMap {
  val iterator = keys()
  while (iterator.hasNext()) {
    val key = iterator.next()
    put(key, publicationValue(opt(key)))
  }
}

private fun JSONArray.toPublicationValue(): List<Any?> =
  List(length()) { index -> publicationValue(opt(index)) }

private fun publicationValue(value: Any?): Any? = when (value) {
  null, JSONObject.NULL -> null
  is JSONObject -> value.toPublicationValue()
  is JSONArray -> value.toPublicationValue()
  is Boolean, is Number, is String -> value
  else -> value.toString()
}
