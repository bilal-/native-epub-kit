package com.bilal.nativeepubkit

import android.os.Parcel
import android.os.Parcelable
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.html.HtmlDecorationTemplate
import org.readium.r2.navigator.html.HtmlDecorationTemplates
import org.readium.r2.navigator.html.toCss
import org.readium.r2.shared.publication.Locator

internal data class NativeMarginIconDecorationStyle(
  val asset: String,
  val tint: Int,
) : Decoration.Style {
  private constructor(parcel: Parcel) : this(
    asset = requireNotNull(parcel.readString()),
    tint = parcel.readInt(),
  )

  override fun writeToParcel(parcel: Parcel, flags: Int) {
    parcel.writeString(asset)
    parcel.writeInt(tint)
  }

  override fun describeContents(): Int = 0

  companion object {
    @JvmField
    val CREATOR: Parcelable.Creator<NativeMarginIconDecorationStyle> =
      object : Parcelable.Creator<NativeMarginIconDecorationStyle> {
        override fun createFromParcel(parcel: Parcel): NativeMarginIconDecorationStyle =
          NativeMarginIconDecorationStyle(parcel)

        override fun newArray(size: Int): Array<NativeMarginIconDecorationStyle?> =
          arrayOfNulls(size)
      }
  }
}

internal data class NativeRoundedBoxDecorationStyle(
  val tint: Int,
  val borderRadius: Double,
  val borderWidth: Double,
  val fillOpacity: Double,
  val isActive: Boolean,
) : Decoration.Style {
  private constructor(parcel: Parcel) : this(
    tint = parcel.readInt(),
    borderRadius = parcel.readDouble(),
    borderWidth = parcel.readDouble(),
    fillOpacity = parcel.readDouble(),
    isActive = parcel.readInt() == 1,
  )

  override fun writeToParcel(parcel: Parcel, flags: Int) {
    parcel.writeInt(tint)
    parcel.writeDouble(borderRadius)
    parcel.writeDouble(borderWidth)
    parcel.writeDouble(fillOpacity)
    parcel.writeInt(if (isActive) 1 else 0)
  }

  override fun describeContents(): Int = 0

  companion object {
    @JvmField
    val CREATOR: Parcelable.Creator<NativeRoundedBoxDecorationStyle> =
      object : Parcelable.Creator<NativeRoundedBoxDecorationStyle> {
        override fun createFromParcel(parcel: Parcel): NativeRoundedBoxDecorationStyle =
          NativeRoundedBoxDecorationStyle(parcel)

        override fun newArray(size: Int): Array<NativeRoundedBoxDecorationStyle?> =
          arrayOfNulls(size)
      }
  }
}

internal object NativeDecorationRenderer {
  fun templates(): HtmlDecorationTemplates = HtmlDecorationTemplates.defaultTemplates().apply {
    set(NativeMarginIconDecorationStyle::class, marginIconTemplate)
    set(NativeRoundedBoxDecorationStyle::class, roundedBoxTemplate)
  }

  fun readiumDecoration(value: ResolvedNativeDecoration): Decoration {
    val locator = Locator.fromJSON(value.locator)
      ?: throw DecorationPolicyException("$/decoration/locator", "is not a Readium locator")
    val style: Decoration.Style = when (val input = value.style) {
      is ResolvedNativeDecorationStyle.Highlight -> Decoration.Style.Highlight(
        tint = color(input.tint),
        isActive = input.isActive,
      )
      is ResolvedNativeDecorationStyle.Underline -> Decoration.Style.Underline(
        tint = color(input.tint),
        isActive = input.isActive,
      )
      is ResolvedNativeDecorationStyle.MarginIcon -> NativeMarginIconDecorationStyle(
        asset = input.asset,
        tint = color(input.tint),
      )
      is ResolvedNativeDecorationStyle.RoundedBox -> NativeRoundedBoxDecorationStyle(
        tint = color(input.tint),
        borderRadius = input.borderRadius,
        borderWidth = input.borderWidth,
        fillOpacity = input.fillOpacity,
        isActive = input.isActive,
      )
    }
    return Decoration(id = value.id, locator = locator, style = style)
  }

  private fun color(value: String): Int {
    val digits = value.drop(1)
    return try {
      if (digits.length == 8) {
        val redGreenBlue = digits.substring(0, 6).toLong(16)
        val alpha = digits.substring(6, 8).toLong(16)
        ((alpha shl 24) or redGreenBlue).toInt()
      } else {
        (0xFF000000L or digits.toLong(16)).toInt()
      }
    } catch (_: NumberFormatException) {
      throw DecorationPolicyException("$/decoration/style/tint", "is invalid")
    }
  }

  private val marginIconTemplate = HtmlDecorationTemplate(
    layout = HtmlDecorationTemplate.Layout.BOUNDS,
    width = HtmlDecorationTemplate.Width.PAGE,
    element = { decoration ->
      val style = decoration.style as? NativeMarginIconDecorationStyle
        ?: return@HtmlDecorationTemplate "<div/>"
      val assetClass = if (style.asset == "bookmark") "bookmark" else "note"
      """
      <div><span data-activable="1" class="native-epub-kit-margin-icon $assetClass" style="--native-epub-kit-decoration-tint: ${style.tint.toCss()}"></span></div>
      """.trimIndent()
    },
    stylesheet = """
      .native-epub-kit-margin-icon {
        position: absolute;
        inset-block-start: 1px;
        inset-inline-start: 8px;
        width: 20px;
        height: 20px;
        box-sizing: border-box;
        background-color: var(--native-epub-kit-decoration-tint);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
        opacity: 0.9;
      }
      .native-epub-kit-margin-icon.bookmark {
        border-radius: 2px 2px 1px 1px;
        clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
      }
      .native-epub-kit-margin-icon.note {
        border: 3px solid var(--native-epub-kit-decoration-tint);
        border-radius: 50%;
        background: var(--RS__backgroundColor);
      }
      .native-epub-kit-margin-icon.note::after {
        content: "";
        position: absolute;
        inset: 5px;
        border-radius: 50%;
        background-color: var(--native-epub-kit-decoration-tint);
      }
    """.trimIndent(),
  )

  private val roundedBoxTemplate = HtmlDecorationTemplate(
    layout = HtmlDecorationTemplate.Layout.BOXES,
    element = { decoration ->
      val style = decoration.style as? NativeRoundedBoxDecorationStyle
        ?: return@HtmlDecorationTemplate "<div/>"
      val shadow = if (style.isActive) {
        "box-shadow: 0 0 0 2px ${style.tint.toCss(alpha = 0.35)};"
      } else {
        ""
      }
      """
      <div data-activable="1" class="native-epub-kit-rounded-box" style="background-color: ${style.tint.toCss(alpha = style.fillOpacity)}; border-color: ${style.tint.toCss()}; border-radius: ${style.borderRadius}px; border-width: ${style.borderWidth}px; $shadow"></div>
      """.trimIndent()
    },
    stylesheet = """
      .native-epub-kit-rounded-box {
        box-sizing: border-box;
        border-style: solid;
        margin: 0 -1px;
        padding: 0 2px;
      }
    """.trimIndent(),
  )
}
