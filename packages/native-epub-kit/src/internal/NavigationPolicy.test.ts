import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NativeEpubKitError } from '../recordValidation';
import {
  MAXIMUM_NAVIGATION_POSITION,
  normalizeNavigationOptions,
  normalizeNavigationRequestOptions,
  normalizeNavigationPosition,
  normalizeNavigationProgression,
  normalizeNavigationTarget,
} from './NavigationPolicy';

interface NavigationContract {
  maximumBridgePosition: number;
  positionCases: { name: string; valid: boolean; value: number }[];
  progressionCases: { name: string; valid: boolean; value: number }[];
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/navigation-v1/cases.json', import.meta.url),
    'utf8'
  )
) as NavigationContract;

describe('navigation input policy', () => {
  it('matches the shared navigation bounds contract', () => {
    expect(contract.version).toBe(1);
    expect(MAXIMUM_NAVIGATION_POSITION).toBe(contract.maximumBridgePosition);
    for (const testCase of contract.progressionCases) {
      const action = () => normalizeNavigationProgression(testCase.value);
      if (testCase.valid) expect(action()).toBe(testCase.value);
      else expect(action, testCase.name).toThrow(NativeEpubKitError);
    }
    for (const testCase of contract.positionCases) {
      const action = () => normalizeNavigationPosition(testCase.value);
      if (testCase.valid) expect(action()).toBe(testCase.value);
      else expect(action, testCase.name).toThrow(NativeEpubKitError);
    }
  });

  it('normalizes locator and publication-link targets without sharing mutable input', () => {
    const locator = {
      children: [{ consumerExtension: true }],
      href: 'text/chapter-2.xhtml',
      locations: { progression: 0.4 },
      type: 'application/xhtml+xml',
    };
    expect(normalizeNavigationTarget(locator)).toEqual({
      kind: 'locator',
      value: JSON.stringify(locator),
    });

    const link = {
      children: [],
      href: 'text/chapter-3.xhtml#section',
      title: 'Chapter 3',
    };
    expect(normalizeNavigationTarget(link)).toEqual({
      kind: 'link',
      value: 'text/chapter-3.xhtml#section',
    });
  });

  it('applies closed progression, one-based position, and boolean option bounds', () => {
    expect(normalizeNavigationProgression(0)).toBe(0);
    expect(normalizeNavigationProgression(1)).toBe(1);
    expect(normalizeNavigationPosition(1)).toBe(1);
    expect(normalizeNavigationOptions()).toBe(false);
    expect(normalizeNavigationOptions({ animated: true })).toBe(true);
    expect(normalizeNavigationRequestOptions()).toEqual({ animated: false, history: 'push' });
    expect(normalizeNavigationRequestOptions(undefined, 'ignore')).toEqual({
      animated: false,
      history: 'ignore',
    });
    expect(normalizeNavigationRequestOptions({ history: 'ignore' })).toEqual({
      animated: false,
      history: 'ignore',
    });

    for (const action of [
      () => normalizeNavigationProgression(-0.01),
      () => normalizeNavigationProgression(Number.NaN),
      () => normalizeNavigationPosition(0),
      () => normalizeNavigationPosition(1.5),
      () => normalizeNavigationOptions({ animated: 'yes' } as never),
      () => normalizeNavigationOptions({ history: 'replace' } as never),
      () => normalizeNavigationOptions({ unknown: true } as never),
      () => normalizeNavigationTarget({ href: 'chapter.xhtml' } as never),
    ]) {
      try {
        action();
        throw new Error('Expected navigation input to be rejected.');
      } catch (error) {
        expect(error).toBeInstanceOf(NativeEpubKitError);
        expect((error as NativeEpubKitError).code).toBe('INVALID_LOCATOR');
        expect((error as NativeEpubKitError).phase).toBe('navigate');
      }
    }
  });
});
