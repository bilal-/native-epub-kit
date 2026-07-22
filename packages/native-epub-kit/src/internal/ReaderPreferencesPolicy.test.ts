import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { PublicationLayout, ReaderPreferenceName, ReaderPreferences } from '../records';
import {
  DEFAULT_READER_PREFERENCES,
  READER_PREFERENCE_RANGES,
  normalizeReaderPreferences,
  parseReaderPreferencesStatus,
  readerPreferencePolicy,
} from './ReaderPreferencesPolicy';

interface Contract {
  defaults: typeof DEFAULT_READER_PREFERENCES;
  normalizationCases: {
    expected?: typeof DEFAULT_READER_PREFERENCES | null;
    input: ReaderPreferences;
    name: string;
    valid: boolean;
  }[];
  policyCases: {
    applied: ReaderPreferenceName[];
    layout: PublicationLayout;
    name: string;
    preferences: ReaderPreferences;
    unsupported: Partial<Record<ReaderPreferenceName, string>>;
    warnings: string[];
  }[];
  ranges: typeof READER_PREFERENCE_RANGES;
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/preferences-v1/cases.json', import.meta.url),
    'utf8'
  )
) as Contract;

describe('preferences-v1 policy', () => {
  it('pins defaults and common toolkit ranges', () => {
    expect(contract.version).toBe(1);
    expect(DEFAULT_READER_PREFERENCES).toEqual(contract.defaults);
    expect(READER_PREFERENCE_RANGES).toEqual(contract.ranges);
  });

  for (const testCase of contract.normalizationCases) {
    it(`normalizes ${testCase.name}`, () => {
      const action = () => normalizeReaderPreferences(testCase.input);
      if (!testCase.valid) {
        expect(action).toThrow();
        return;
      }
      expect(action()).toEqual(testCase.expected ?? { ...contract.defaults, ...testCase.input });
    });
  }

  for (const testCase of contract.policyCases) {
    it(`resolves ${testCase.name}`, () => {
      const requested = normalizeReaderPreferences(testCase.preferences);
      const policy = readerPreferencePolicy(requested, testCase.layout);
      expect(Object.keys(policy.applied)).toEqual(testCase.applied);
      expect(
        Object.fromEntries(
          policy.support.filter((item) => !item.supported).map((item) => [item.name, item.reason])
        )
      ).toEqual(testCase.unsupported);
      expect(policy.warnings).toEqual(testCase.warnings);

      const status = parseReaderPreferencesStatus({
        ...policy,
        generation: 2,
        instanceId: 'fixture',
        publicationLayout: testCase.layout,
        requested,
      });
      expect(status.applied).toEqual(policy.applied);
      expect(status.requested).not.toBe(requested);
      expect(status.support).not.toBe(policy.support);
    });
  }

  it('rejects malformed native status records', () => {
    expect(() => parseReaderPreferencesStatus({})).toThrow();
    expect(() =>
      parseReaderPreferencesStatus({
        applied: {},
        generation: 0,
        instanceId: 'fixture',
        publicationLayout: 'reflowable',
        requested: DEFAULT_READER_PREFERENCES,
        support: [],
        warnings: [],
      })
    ).toThrow();

    const requested = normalizeReaderPreferences({ publisherStyles: false });
    const policy = readerPreferencePolicy(requested, 'reflowable');
    const validStatus = {
      ...policy,
      generation: 0,
      instanceId: 'fixture',
      publicationLayout: 'reflowable',
      requested,
    } as const;
    expect(() => parseReaderPreferencesStatus({ ...validStatus, applied: {} })).toThrow(
      'exactly match supported'
    );
    expect(() =>
      parseReaderPreferencesStatus({
        ...validStatus,
        applied: { ...validStatus.applied, theme: 'sepia' },
      })
    ).toThrow('must equal its requested value');
  });
});
