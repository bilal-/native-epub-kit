import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { ReaderSelectionAction, TextDirection } from '../records.ts';
import {
  MAXIMUM_SELECTION_ACTIONS,
  MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS,
  MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS,
  MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS,
  MAXIMUM_SELECTION_TEXT_UTF16_UNITS,
  normalizeReaderSelectionActions,
  selectionTextDirection,
} from './SelectionActionPolicy.ts';

interface ActionCase {
  actions: ReaderSelectionAction[] | null;
  expected?: ReaderSelectionAction[];
  expectedError?: boolean;
  name: string;
}

interface DirectionCase {
  expected: TextDirection;
  name: string;
  text: string;
}

interface Contract {
  actionCases: ActionCase[];
  directionCases: DirectionCase[];
  maximumActionIdUtf16Units: number;
  maximumActionTitleUtf16Units: number;
  maximumActions: number;
  maximumSelectionContextUtf16Units: number;
  maximumSelectionTextUtf16Units: number;
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/selection-action-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as Contract;

describe('selection-action-policy-v1 contract', () => {
  it('freezes version and every public bound', () => {
    expect(contract.version).toBe(1);
    expect(MAXIMUM_SELECTION_ACTIONS).toBe(contract.maximumActions);
    expect(MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS).toBe(contract.maximumActionIdUtf16Units);
    expect(MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS).toBe(contract.maximumActionTitleUtf16Units);
    expect(MAXIMUM_SELECTION_TEXT_UTF16_UNITS).toBe(contract.maximumSelectionTextUtf16Units);
    expect(MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS).toBe(contract.maximumSelectionContextUtf16Units);
  });

  for (const testCase of contract.actionCases) {
    it(`normalizes ${testCase.name}`, () => {
      const action = () => normalizeReaderSelectionActions(testCase.actions ?? undefined);
      if (testCase.expectedError) expect(action).toThrow(TypeError);
      else expect(action()).toEqual(testCase.expected);
    });
  }

  for (const testCase of contract.directionCases) {
    it(`infers ${testCase.name}`, () => {
      expect(selectionTextDirection(testCase.text)).toBe(testCase.expected);
    });
  }

  it('rejects more than the maximum action count', () => {
    expect(() =>
      normalizeReaderSelectionActions(
        Array.from({ length: MAXIMUM_SELECTION_ACTIONS + 1 }, (_, index) => ({
          id: `action-${index}`,
          title: `Action ${index}`,
        }))
      )
    ).toThrow(TypeError);
  });
});
