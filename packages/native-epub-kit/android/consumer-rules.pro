# Native EPUB Kit wraps Readium Kotlin 3.1.2's package-internal WebView listener
# to block main-frame URI schemes that its AbsoluteUrl parser cannot model.
# The exact Readium revision is pinned and this reflective compatibility seam is
# covered by the installed footnote/link device matrix.
-keep class org.readium.r2.navigator.R2BasicWebView { *; }
-keep class org.readium.r2.navigator.R2WebView { *; }
-keep interface org.readium.r2.navigator.R2BasicWebView$Listener { *; }
