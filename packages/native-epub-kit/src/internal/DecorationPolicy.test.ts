import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type { ReaderDecoration, ReaderDecorationChange } from '../records.ts';
import {
  applyReaderDecorationChanges,
  normalizeReaderDecoration,
  normalizeReaderDecorationChanges,
  normalizeReaderDecorations,
} from './DecorationPolicy.ts';

const locator = {
  href: 'text/chapter.xhtml',
  locations: { fragments: ['paragraph-1'] },
  text: { highlight: 'Addressable paragraph 1.' },
  type: 'application/xhtml+xml',
};

interface DecorationPolicyContract {
  baseLocator: typeof locator;
  deltaCases: {
    changes: (
      | { decoration: { id: string; style: ReaderDecoration['style'] }; type: 'add' | 'update' }
      | { id: string; type: 'remove' }
    )[];
    expected?: { id: string; style: ReaderDecoration['style'] }[];
    expectedError?: boolean;
    initial: { id: string; style: ReaderDecoration['style'] }[];
    name: string;
  }[];
  groupCases: { expected?: string; expectedError?: boolean; input: string; name: string }[];
  maximumChanges: number;
  maximumDataUtf8Bytes: number;
  maximumDecorationsPerGroup: number;
  maximumGroupUtf16Units: number;
  maximumGroups: number;
  maximumIdUtf16Units: number;
  styleCases: {
    expected?: ReaderDecoration['style'];
    expectedError?: boolean;
    input: ReaderDecoration['style'];
    name: string;
  }[];
  version: number;
}

const contract = JSON.parse(
  await readFile(
    new URL('../../../testing/contracts/decoration-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as DecorationPolicyContract;

function decoration(id: string, style: ReaderDecoration['style']): ReaderDecoration {
  return { id, locator, style };
}

describe('decoration policy', () => {
  it('matches the frozen cross-language group and style contract', () => {
    for (const testCase of contract.groupCases) {
      const action = () => normalizeReaderDecorations(testCase.input, []);
      if (testCase.expectedError) expect(action, testCase.name).toThrow();
      else expect(action().group, testCase.name).toBe(testCase.expected);
    }
    for (const testCase of contract.styleCases) {
      const action = () =>
        normalizeReaderDecoration({
          id: 'contract-style',
          locator: contract.baseLocator,
          style: testCase.input,
        });
      if (testCase.expectedError) expect(action, testCase.name).toThrow();
      else expect(action().style, testCase.name).toEqual(testCase.expected);
    }
  });

  it('matches the frozen cross-language delta contract', () => {
    const expand = (value: { id: string; style: ReaderDecoration['style'] }) => ({
      ...value,
      locator: contract.baseLocator,
    });
    for (const testCase of contract.deltaCases) {
      const changes = testCase.changes.map((change) =>
        change.type === 'remove' ? change : { ...change, decoration: expand(change.decoration) }
      ) as ReaderDecorationChange[];
      const action = () => {
        const normalized = normalizeReaderDecorationChanges('annotations', changes);
        return applyReaderDecorationChanges(testCase.initial.map(expand), normalized.changes);
      };
      if (testCase.expectedError) {
        expect(action, testCase.name).toThrow();
      } else {
        expect(
          action().map(({ id, style }) => ({ id, style })),
          testCase.name
        ).toEqual(testCase.expected);
      }
    }
  });

  it('normalizes every supported constrained style', () => {
    expect(
      normalizeReaderDecoration(decoration('highlight-1', { tint: '#E8C97A', type: 'highlight' }))
    ).toMatchObject({ style: { isActive: false, tint: '#e8c97a', type: 'highlight' } });
    expect(
      normalizeReaderDecoration(decoration('underline-1', { tint: '#D4907AFF', type: 'underline' }))
    ).toMatchObject({ style: { isActive: false, tint: '#d4907aff', type: 'underline' } });
    expect(
      normalizeReaderDecoration(decoration('note-1', { asset: 'note', type: 'margin-icon' }))
    ).toMatchObject({ style: { asset: 'note', tint: '#64748b', type: 'margin-icon' } });
    expect(
      normalizeReaderDecoration(
        decoration('custom-1', { template: 'rounded-box-v1', type: 'custom' })
      )
    ).toMatchObject({
      style: {
        config: {
          borderRadius: 4,
          borderWidth: 2,
          fillOpacity: 0.12,
          isActive: false,
          tint: '#e8c97a',
        },
        template: 'rounded-box-v1',
        type: 'custom',
      },
    });
  });

  it('rejects unsafe identifiers, styles, extension fields, and large data', () => {
    expect(() => normalizeReaderDecorations("annotations');alert(1)//", [])).toThrow(/group/);
    expect(() =>
      normalizeReaderDecoration(decoration('bad id', { tint: '#e8c97a', type: 'highlight' }))
    ).toThrow(/id/);
    expect(() =>
      normalizeReaderDecoration(decoration('bad-tint', { tint: 'red', type: 'highlight' }))
    ).toThrow(/tint/);
    expect(() =>
      normalizeReaderDecoration({
        ...decoration('bad-asset', { asset: 'remote' as 'note', type: 'margin-icon' }),
        script: 'alert(1)',
      })
    ).toThrow(/unsupported field/);
    expect(() =>
      normalizeReaderDecoration({
        ...decoration('large-data', { tint: '#e8c97a', type: 'highlight' }),
        data: { value: 'x'.repeat(9_000) },
      })
    ).toThrow(/8192/);
  });

  it('keeps groups isolated and applies add, update, and remove atomically in order', () => {
    const first = decoration('one', { tint: '#e8c97a', type: 'highlight' });
    const second = decoration('two', { tint: '#8eb8cc', type: 'underline' });
    const changes: ReaderDecorationChange[] = [
      { decoration: second, type: 'add' },
      {
        decoration: decoration('one', { asset: 'note', tint: '#d4907a', type: 'margin-icon' }),
        type: 'update',
      },
      { id: 'two', type: 'remove' },
    ];
    const normalized = normalizeReaderDecorationChanges('annotations', changes);
    const result = applyReaderDecorationChanges([first], normalized.changes);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'one', style: { asset: 'note', type: 'margin-icon' } });
  });

  it('preserves every JSON data shape including explicit nulls', () => {
    for (const data of [null, true, 7, 'note', ['one', null], { note: null }] as const) {
      expect(
        normalizeReaderDecoration({
          ...decoration('json-data', { tint: '#e8c97a', type: 'highlight' }),
          data,
        }).data
      ).toEqual(data);
    }
  });

  it('rejects duplicate full-state IDs and invalid delta state transitions', () => {
    const first = decoration('one', { tint: '#e8c97a', type: 'highlight' });
    expect(() => normalizeReaderDecorations('annotations', [first, first])).toThrow(/duplicated/);
    expect(() =>
      applyReaderDecorationChanges([first], [{ decoration: first, type: 'add' }])
    ).toThrow(/existing/);
    expect(() => applyReaderDecorationChanges([], [{ id: 'missing', type: 'remove' }])).toThrow(
      /missing/
    );
  });
});
