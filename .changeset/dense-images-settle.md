---
'native-epub-kit': patch
---

Defer offscreen images in exceptionally image-dense Android EPUB resources to
prevent WebView renderer exhaustion, and report an unsuccessful jump when the
navigator cannot settle at its requested locator. Treat a close adjacent
position at the requested overall progression as settled so reflow and resource
boundaries do not produce false navigation failures.
