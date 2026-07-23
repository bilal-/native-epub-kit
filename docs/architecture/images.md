# Image activation, source resolution, and rights policy

LIB-072 exposes publication-image activation as a stable, headless reader
capability. The native adapters report what was activated and can materialize
an exact bounded publication resource for a consumer-owned zoom or sharing
flow. Native EPUB Kit does not render a zoom viewer, open a share sheet, fetch
external images, or decide a publication's legal rights.

## Public surface

```tsx
const readerRef = useRef<EpubReaderViewRef>(null);

<EpubReaderView
  ref={readerRef}
  imagePolicy={{ allowZoom: true, allowSharing: false }}
  onImagePress={async (event) => {
    if (!event.source.resolvable || !event.rights.canZoom) return;
    const resolved = await readerRef.current!.resolveImageSource(event.source, 'zoom');
    try {
      await presentAppOwnedZoomViewer(resolved.uri, event.alt, event.caption);
    } finally {
      await readerRef.current?.releaseImageSource(resolved.id);
    }
  }}
/>;
```

`ReaderImageActivationEvent` contains native instance/generation identity, a
monotonic sequence, canonical Readium `Locator`, platform, optional normalized
reader/window geometry, bounded alt text and caption, an immutable rights
snapshot, and a `ReaderImageSource` descriptor.

The source kind is one of:

- `publication-resource`, with a canonical publication-relative href;
- `inline-svg`, whose bytes remain native until explicitly resolved; or
- `external`, which is observable but never fetched or materialized.

A resolvable source carries an opaque generation-scoped handle. Consumers must
pass the complete descriptor to `resolveImageSource(source, 'zoom' | 'share')`;
the TypeScript facade extracts and validates the handle. Unresolved sources
omit the handle and report one closed reason: `external-resource`,
`resource-not-found`, `source-too-large`, or `unsupported-source`.

## Rights and trust boundary

The default policy is fail-closed for sharing and enabled for zoom:

```ts
{ allowSharing: false, allowZoom: true }
```

Policy is enforced twice: the activation event receives the current immutable
`canShare`/`canZoom` snapshot, and the resolver checks the live policy again at
command time. Disallowed resolution rejects with
`SOURCE_PERMISSION_DENIED` in the stable `resource` error phase. Unknown
policy keys and non-boolean values reject in TypeScript before reaching native
code; native adapters also decode defensively and fall back to the safe
default.

This policy is a trusted-consumer UI and workflow boundary, not DRM. It cannot
establish copyright ownership, defeat screenshots or operating-system access,
or replace publication license review. Applications own the policy source,
user messaging, zoom UI, sharing UI, analytics decision, and any additional
rights checks.

## Materialization and lifetime

Resolution reads only an admitted resource from the already-open publication
or the captured inline SVG bytes. It returns a validated
`ReaderResolvedImageSource` containing a `file:` URI, image media type, exact
byte length, and opaque materialization ID. It never returns publication bytes
through an event or React prop.

Native bounds are deliberately conservative:

| Resource                             | Bound              |
| ------------------------------------ | ------------------ |
| One materialized image               | 32 MiB             |
| Active materialized files per reader | 32                 |
| Active source handles per generation | 256                |
| Source handle or materialization ID  | 128 UTF-16 units   |
| Alt text or caption                  | 4,096 UTF-16 units |

Call `releaseImageSource(id)` as soon as an app-owned viewer or sharing flow is
finished. Release is idempotent for an unknown or already-released ID. Source
replacement, close, failed open, unmount, and native disposal revoke every
handle, cancel pending resolution, and remove all remaining temporary files.
An old-generation handle cannot resolve against a new publication.

## Native activation and platform capability

iOS registers Readium Swift's target-element input observer before directional
navigation. The pinned integration reports image/SVG activation for
reflowable and fixed-layout navigators, and the adapter derives source,
locator, alt text, figure caption, and target rectangle without exposing a
script API.

Readium Kotlin 3.1.2 exposes a tap point but no public target-element payload
for reflowable content. The adapter evaluates one package-owned, result-only
hit-test inside the existing navigator WebView, admits only the nearest
`img`/`svg`, and returns bounded source/metadata/rectangle fields. No consumer
script, selector, navigation, mutation, or arbitrary evaluation surface is
exposed.

That pinned Kotlin API does not offer the same fixed-layout target inspection.
Android therefore reports `capabilities.images: false` for fixed-layout EPUBs
and adds `android-fixed-layout-image-activation-unsupported`. iOS reports image
activation for both layouts. Reflowable image activation is supported on both
platforms. Consumers must branch on the publication capability instead of
assuming parity from the package version.

## Verification

The `image-policy-v1` fixture runs in TypeScript, Swift, and Kotlin. The
`readerImageActivationEvent` golden is part of the shared `core-v1` corpus, and
diagnostic fixtures freeze the reflowable/fixed capability difference. Unit
tests reject malformed handles, incoherent resolvability, unsafe media types,
non-local resolved URIs, and policy violations.

The example's iPad and Android-tablet flows activate the generated SVG and
verify canonical locator, alt text, caption, rights, geometry where available,
and a usable source handle. Both resolve the exact 640-byte local SVG for zoom,
reject sharing by default, resolve sharing after explicit opt-in, and release
each file. The same flows verify fixed-layout `images: true` on iOS and the
explicit Android capability warning.
