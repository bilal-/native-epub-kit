import type {
  ReaderImagePolicy,
  ReaderImageSource,
  ReaderImageUse,
  ResolvedReaderImagePolicy,
} from '../records.ts';

export const DEFAULT_READER_IMAGE_POLICY: Readonly<ResolvedReaderImagePolicy> = Object.freeze({
  allowSharing: false,
  allowZoom: true,
});

export const MAXIMUM_READER_IMAGE_SOURCE_HANDLE_UTF16_UNITS = 128;

function reject(message: string): never {
  throw new TypeError(`Reader image policy: ${message}`);
}

export function normalizeReaderImagePolicy(value?: ReaderImagePolicy): ResolvedReaderImagePolicy {
  if (value === undefined) return { ...DEFAULT_READER_IMAGE_POLICY };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject('value must be an object.');
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== 'allowSharing' && key !== 'allowZoom') {
      reject(`${key} is not supported.`);
    }
  }
  const allowSharing = input.allowSharing ?? DEFAULT_READER_IMAGE_POLICY.allowSharing;
  const allowZoom = input.allowZoom ?? DEFAULT_READER_IMAGE_POLICY.allowZoom;
  if (typeof allowSharing !== 'boolean') reject('allowSharing must be a boolean.');
  if (typeof allowZoom !== 'boolean') reject('allowZoom must be a boolean.');
  return { allowSharing, allowZoom };
}

export function readerImageUseAllowed(
  policy: ResolvedReaderImagePolicy,
  use: ReaderImageUse
): boolean {
  if (use === 'zoom') return policy.allowZoom;
  if (use === 'share') return policy.allowSharing;
  reject('use must be zoom or share.');
}

export function readerImageSourceHandle(source: ReaderImageSource): string {
  if (!source.resolvable || source.handle === undefined) {
    reject('source is not resolvable.');
  }
  if (
    source.handle.length === 0 ||
    source.handle.length > MAXIMUM_READER_IMAGE_SOURCE_HANDLE_UTF16_UNITS
  ) {
    reject('source handle is invalid.');
  }
  return source.handle;
}
