---
'native-epub-kit': patch
---

Keep Android's native selection and handles active after a custom action while
hiding the floating ActionMode toolbar for the lifetime of the consumer-owned
action surface, including across rotation-driven ActionMode replacement, so
the two interfaces cannot obscure each other.
