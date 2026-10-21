---
'native-epub-kit': patch
---

Refresh reading checkpoints from the canonical native viewport on iOS and Android, preserving exact page progression when restoring or changing layout. Deliver available search batches before scanning for a full page. Use resource-based search on iOS so malformed legacy XHTML returns an extraction error instead of retrying indefinitely.
