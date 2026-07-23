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
