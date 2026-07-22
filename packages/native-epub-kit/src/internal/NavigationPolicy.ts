import {
  NativeEpubKitError,
  RecordValidationError,
  parseLocator,
  parsePublicationLink,
  serializeCoreRecord,
} from '../recordValidation.ts';
import type {
  Locator,
  NavigationHistoryBehavior,
  NavigationOptions,
  PublicationLink,
  ReaderError,
} from '../records.ts';

export interface NormalizedNavigationTarget {
  kind: 'link' | 'locator';
  value: string;
}

export const MAXIMUM_NAVIGATION_POSITION = 2_147_483_647;

export interface NormalizedNavigationOptions {
  animated: boolean;
  history: NavigationHistoryBehavior;
}

export function normalizeNavigationRequestOptions(
  options?: NavigationOptions,
  defaultHistory: NavigationHistoryBehavior = 'push'
): NormalizedNavigationOptions {
  if (defaultHistory !== 'push' && defaultHistory !== 'ignore') {
    throw invalidNavigationInput('Default navigation history behavior is invalid.');
  }
  if (options === undefined) return { animated: false, history: defaultHistory };
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw invalidNavigationInput('Navigation options must be an object when provided.');
  }
  const unknown = Object.keys(options).find((key) => key !== 'animated' && key !== 'history');
  if (unknown) throw invalidNavigationInput(`Unknown navigation option ${unknown}.`);
  if (options.animated !== undefined && typeof options.animated !== 'boolean') {
    throw invalidNavigationInput('Navigation option animated must be a boolean.');
  }
  if (options.history !== undefined && options.history !== 'push' && options.history !== 'ignore') {
    throw invalidNavigationInput('Navigation option history must be push or ignore.');
  }
  return {
    animated: options.animated ?? false,
    history: options.history ?? defaultHistory,
  };
}

export function normalizeNavigationOptions(options?: NavigationOptions): boolean {
  return normalizeNavigationRequestOptions(options).animated;
}

export function normalizeNavigationProgression(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw invalidNavigationInput('Publication progression must be a finite number from 0 to 1.');
  }
  return value;
}

export function normalizeNavigationPosition(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_NAVIGATION_POSITION) {
    throw invalidNavigationInput(
      'Publication position must be a one-based 32-bit bridge-safe integer.'
    );
  }
  return value;
}

export function normalizeNavigationTarget(
  target: Locator | PublicationLink
): NormalizedNavigationTarget {
  try {
    if (typeof target === 'object' && target !== null && Object.hasOwn(target, 'locations')) {
      const locator = parseLocator(target);
      return {
        kind: 'locator',
        value: JSON.stringify(serializeCoreRecord('locator', locator)),
      };
    }
    const link = parsePublicationLink(target);
    return { kind: 'link', value: link.href };
  } catch (error) {
    if (error instanceof RecordValidationError) {
      throw invalidNavigationInput(`The navigation target is invalid: ${error.message}`);
    }
    throw error;
  }
}

export function parseNavigationBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('Native navigation result must be a boolean.');
  }
  return value;
}

export function invalidNavigationInput(message: string): NativeEpubKitError {
  return navigationError({
    code: 'INVALID_LOCATOR',
    message,
    phase: 'navigate',
    recoverable: true,
  });
}

function navigationError(record: ReaderError): NativeEpubKitError {
  return new NativeEpubKitError(record);
}
