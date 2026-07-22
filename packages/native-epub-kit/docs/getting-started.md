# Install and open a local EPUB

## Requirements

- Expo SDK `>=56.0.0 <57.0.0`
- React Native `>=0.85.0 <0.86.0`
- React `>=19.2.0 <20.0.0`
- iOS 16.4 or later
- Android API 24 or later
- an Expo development build or native release build; Expo Go cannot load this
  native module

The package pins the qualified Readium revisions. Applications must not add a
second Readium dependency or override those native versions.

## Install

Install the published package when a release exists:

```sh
npm install native-epub-kit@0.1.0
```

For a local release candidate, install the exact packed tarball instead:

```sh
npm install ./native-epub-kit-0.1.0.tgz
```

Add the config plugin to the Expo app configuration:

```json
{
  "expo": {
    "plugins": ["native-epub-kit"]
  }
}
```

Then regenerate native projects and build them:

```sh
npx expo prebuild --clean
npx expo run:ios
npx expo run:android
```

The plugin installs the exact iOS podspecs, Android desugaring requirement,
and optional native font manifest. Re-run prebuild after changing the plugin,
its font options, Expo SDK, React Native, or the package version.

## Optional reader fonts

Fonts are an explicit build-time contract. Every source must be a readable
project-relative `.ttf` or `.otf` file inside the Expo project root.

```json
{
  "expo": {
    "plugins": [
      [
        "native-epub-kit",
        {
          "fonts": [
            {
              "family": "My Reader Font",
              "source": "./assets/fonts/MyReaderFont-Regular.ttf",
              "weight": 400,
              "style": "normal"
            },
            {
              "family": "My Reader Font",
              "source": "./assets/fonts/MyReaderFont-Bold.ttf",
              "weight": 700,
              "style": "normal"
            }
          ]
        }
      ]
    ]
  }
}
```

Unknown options, duplicate family/weight/style faces, escaping paths, missing
files, invalid signatures, and more than 64 faces fail prebuild before a
partial manifest is accepted.

## Minimal reader

Only pass a local file URI that the application can read. A downloaded EPUB
should be closed before its file is replaced or deleted.

<!-- doctest: examples/MinimalReader.tsx -->

```tsx
import { EpubReaderView, type EpubReaderViewRef } from 'native-epub-kit';
import { useRef } from 'react';

export function BookReader({ epubUri }: { epubUri: string }) {
  const reader = useRef<EpubReaderViewRef>(null);

  return (
    <EpubReaderView
      ref={reader}
      source={{ kind: 'file', uri: epubUri }}
      chapterGranularity="top-level"
      navigationPolicy={{ chapterTurnGesture: 'disabled' }}
      preferences={{ layout: 'scrolled', theme: 'sepia' }}
      onReady={() => console.log('ready')}
      onLocationChange={(event) => console.log(event.locator)}
      onError={({ error }) => console.error(error.code, error.phase)}
      style={{ flex: 1 }}
    />
  );
}
```

Commands are valid only after `onReady`. Set `source={null}` before deleting
the file or when the product wants to close the publication while retaining the
React view. Unmounting the view also closes it.

## Source policy

| Source                                    | Support                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `{ kind: 'file', uri: 'file://…' }`       | iOS and Android; the URI must resolve to a readable local EPUB |
| `{ kind: 'content', uri: 'content://…' }` | Android only; the application owns an existing read grant      |
| `{ kind: 'remote', … }`                   | deliberately rejected before networking in 0.x                 |

Download remote books with application-owned networking, verify the response,
store them locally, and then pass a `file` source. Never place authorization
headers or private URLs in support logs.

## Verify the install

After prebuild, a clean build should contain exactly one Native EPUB Kit module
and one Readium dependency graph. At runtime, `getDiagnostics()` should report
the expected package/toolkit versions and `fonts.status` as `not-configured` or
`valid`, never `invalid`.

Continue with [the core API guide](core-api.md).
