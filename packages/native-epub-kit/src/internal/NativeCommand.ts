import { NativeEpubKitError, parseReaderError } from '../recordValidation.ts';
import type { ReaderError } from '../records.ts';

export type NativeCommandResult = { ok: true; value?: unknown } | { error: unknown; ok: false };

export function readerDestroyedError(): NativeEpubKitError {
  return new NativeEpubKitError({
    code: 'READER_DESTROYED',
    message: 'The native reader view has been destroyed.',
    phase: 'close',
    recoverable: false,
  });
}

export function unwrapNativeCommand<T>(
  result: NativeCommandResult,
  parseValue: (value: unknown) => T
): T {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    throw invalidNativeCommandResult();
  }
  if (!result.ok) {
    let error: ReaderError;
    try {
      error = parseReaderError(result.error);
    } catch {
      throw invalidNativeCommandResult();
    }
    throw new NativeEpubKitError(error);
  }
  try {
    return parseValue(result.value);
  } catch {
    throw invalidNativeCommandResult();
  }
}

function invalidNativeCommandResult(): NativeEpubKitError {
  return new NativeEpubKitError({
    code: 'NATIVE_INVARIANT_VIOLATION',
    message: 'The native reader returned an invalid command result.',
    phase: 'render',
    recoverable: false,
  });
}
