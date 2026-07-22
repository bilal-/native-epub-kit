import { describe, expect, it, vi } from 'vitest';

import type { ReaderState } from '../EpubReaderView.types';
import { dispatchReaderStateEvent } from './ReaderStateEvents';

const state = (overrides: Partial<ReaderState>): ReaderState => ({
  generation: 4,
  hasNavigator: false,
  hostNavigatorCount: 0,
  instanceId: 'reader-a',
  platform: 'ios',
  sequence: 1,
  sessionDiagnostics: {
    activeSessions: 0,
    completedSessions: 0,
    forcedReleaseViolations: 0,
    maximumActiveSessions: 0,
    maximumOwnedAssets: 0,
    maximumOwnedPublications: 0,
    maximumSourceLeases: 0,
    memorySampleCount: 0,
    ownedAssets: 0,
    ownedPublications: 0,
    sourceLeases: 0,
  },
  state: 'idle',
  ...overrides,
});

describe('stable reader callback order', () => {
  it('dispatches ready state before the derived ready callback', () => {
    const order: string[] = [];
    dispatchReaderStateEvent(state({ hasNavigator: true, state: 'ready' }), {
      onReady: (event) => order.push(`ready:${event.sequence}`),
      onStateChange: (event) => order.push(`state:${event.state}:${event.sequence}`),
    });
    expect(order).toEqual(['state:ready:1', 'ready:1']);
  });

  it('dispatches the complete error before the matching error state', () => {
    const order: string[] = [];
    dispatchReaderStateEvent(
      state({
        code: 'SOURCE_NOT_FOUND',
        message: 'The EPUB source does not exist.',
        phase: 'source',
        recoverable: true,
        state: 'error',
      }),
      {
        onError: (event) => order.push(`error:${event.error.code}:${event.sequence}`),
        onStateChange: (event) =>
          order.push(`state:${event.state}:${event.error?.code}:${event.sequence}`),
      }
    );
    expect(order).toEqual(['error:SOURCE_NOT_FOUND:1', 'state:error:SOURCE_NOT_FOUND:1']);
  });

  it('does not synthesize ready or error callbacks for intermediate states', () => {
    const onReady = vi.fn();
    const onError = vi.fn();
    const onStateChange = vi.fn();
    dispatchReaderStateEvent(state({ state: 'opening' }), {
      onError,
      onReady,
      onStateChange,
    });
    expect(onStateChange).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
