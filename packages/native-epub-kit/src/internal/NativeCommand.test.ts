import { describe, expect, it } from 'vitest';

import { NativeEpubKitError } from '../recordValidation';
import { readerDestroyedError, unwrapNativeCommand } from './NativeCommand';

describe('stable native command boundary', () => {
  it('returns validated values from success envelopes', () => {
    expect(unwrapNativeCommand({ ok: true, value: 7 }, (value) => Number(value))).toBe(7);
  });

  it('rejects with the complete stable native error record', () => {
    expect(() =>
      unwrapNativeCommand(
        {
          ok: false,
          error: {
            code: 'READER_NOT_READY',
            message: 'The reader is opening.',
            phase: 'render',
            recoverable: true,
          },
        },
        () => null
      )
    ).toThrowError(
      expect.objectContaining<Partial<NativeEpubKitError>>({
        code: 'READER_NOT_READY',
        phase: 'render',
        recoverable: true,
      })
    );
  });

  it('maps malformed native envelopes to an invariant error', () => {
    expect(() =>
      unwrapNativeCommand({ ok: false, error: { code: 'unknown' } }, () => null)
    ).toThrowError(
      expect.objectContaining<Partial<NativeEpubKitError>>({
        code: 'NATIVE_INVARIANT_VIOLATION',
        recoverable: false,
      })
    );
  });

  it('creates a non-recoverable destroyed-view error for a missing native ref', () => {
    expect(readerDestroyedError()).toEqual(
      expect.objectContaining<Partial<NativeEpubKitError>>({
        code: 'READER_DESTROYED',
        phase: 'close',
        recoverable: false,
      })
    );
  });
});
