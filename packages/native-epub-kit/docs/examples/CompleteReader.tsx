import {
  EpubReaderView,
  createReaderDiagnosticReport,
  type EpubReaderViewRef,
  type ReaderNavigationPolicy,
  type ReaderPreferences,
  type ReaderSelectionAction,
  type TypographyProfile,
} from 'native-epub-kit';
import { useRef, useState } from 'react';

const typographyProfile: TypographyProfile = {
  publisherStyles: 'hybrid',
  colors: {
    background: '#F5F0E8',
    link: '#005A8D',
    text: '#3D2B1F',
  },
  defaultFontFamilies: ['My Reader Font', 'serif'],
  rules: [
    {
      target: { kind: 'language', value: 'ur' },
      fontFamilies: ['My Reader Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'language', value: 'ar' },
      fontFamilies: ['My Reader Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'class', value: 'quranic' },
      color: '#1A5F4A',
    },
  ],
};

const selectionActions: ReaderSelectionAction[] = [
  { id: 'highlight', title: 'Highlight' },
  { id: 'note', title: 'Add note' },
  { id: 'share', title: 'Share quote' },
];

export function Reader({ localEpubUri }: { localEpubUri: string }) {
  const readerRef = useRef<EpubReaderViewRef>(null);
  const [navigationPolicy] = useState<ReaderNavigationPolicy>({
    chapterTurnGesture: 'disabled',
    edgeTapNavigation: false,
  });
  const [preferences] = useState<ReaderPreferences>({
    layout: 'scrolled',
    theme: 'sepia',
  });

  return (
    <EpubReaderView
      ref={readerRef}
      source={{ kind: 'file', uri: localEpubUri }}
      chapterGranularity="top-level"
      navigationPolicy={navigationPolicy}
      preferences={preferences}
      typographyProfile={typographyProfile}
      footnotePolicy={{ mode: 'semantic-and-heuristic' }}
      linkPolicy={{
        allowedExternalSchemes: ['https'],
        externalLinks: 'intercept',
        unsupportedSchemes: 'block',
      }}
      imagePolicy={{ allowZoom: true, allowSharing: false }}
      classifyFootnote={(event) =>
        event.id === 'publisher-navigation-target' ? 'navigate' : 'footnote'
      }
      selectionActions={selectionActions}
      onFootnotePress={(event) => console.log(event.text, event.sourceLocator)}
      onLinkPress={(event) => console.log(event.kind, event.disposition, event.href)}
      onImagePress={async (event) => {
        if (!event.source.resolvable || !event.rights.canZoom) return;
        const resolved = await readerRef.current?.resolveImageSource(event.source, 'zoom');
        if (!resolved) return;
        try {
          console.log(resolved.uri, event.alt, event.caption);
        } finally {
          await readerRef.current?.releaseImageSource(resolved.id);
        }
      }}
      onSelectionAction={(event) =>
        console.log(event.actionId, event.selection.copyAllowed, event.selection.geometry)
      }
      onSelectionChange={(event) => console.log(event.reason, event.handlesActive)}
      onDecorationPress={(event) =>
        console.log(event.group, event.decoration.id, event.decoration.data, event.geometry)
      }
      onNavigationPolicyChange={(status) => {
        console.log(status.applied, status.effectiveLayout, status.application);
      }}
      onPreferencesChange={(status) => {
        console.log(status.requested, status.applied, status.support);
      }}
      onStateChange={(event) => console.log(event.state, event.generation, event.sequence)}
      onReady={async () => {
        const publication = await readerRef.current?.getPublication();
        const firstPositions = await readerRef.current?.getPositions({ limit: 256 });
        const preferenceStatus = await readerRef.current?.getPreferences();
        const navigationPolicyStatus = await readerRef.current?.getNavigationPolicy();
        const navigationUnits = await readerRef.current?.getNavigationUnits('top-level');
        const diagnostics = await readerRef.current?.getDiagnostics();
        console.log(
          publication?.title,
          publication?.tableOfContents,
          firstPositions,
          preferenceStatus,
          navigationPolicyStatus,
          navigationUnits
        );
        if (diagnostics) console.log(createReaderDiagnosticReport(diagnostics));

        const search = await readerRef.current?.search('faith', { pageSize: 50 });
        if (search) {
          const firstSearchPage = await readerRef.current?.getSearchPage(
            search.id,
            search.nextCursor
          );
          console.log(firstSearchPage?.results, firstSearchPage?.truncated);
          await readerRef.current?.cancelSearch(search.id);
        }
      }}
      onError={({ error }) => console.error(error.code, error.message)}
      onLocationChange={(event) =>
        console.log(
          event.locator,
          event.navigationUnit?.title,
          event.chapterProgress,
          event.overallProgress,
          event.precision
        )
      }
      style={{ flex: 1 }}
    />
  );
}
