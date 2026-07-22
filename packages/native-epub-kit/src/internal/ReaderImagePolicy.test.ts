import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { ReaderImagePolicy, ReaderImageUse } from '../records.ts';
import {
  DEFAULT_READER_IMAGE_POLICY,
  normalizeReaderImagePolicy,
  readerImageUseAllowed,
} from './ReaderImagePolicy.ts';

interface ImagePolicyCase {
  expected?: { allowSharing: boolean; allowZoom: boolean };
  expectedError?: boolean;
  name: string;
  policy: ReaderImagePolicy | null;
  uses?: Record<ReaderImageUse, boolean>;
}

interface ImagePolicyContract {
  cases: ImagePolicyCase[];
  defaults: { allowSharing: boolean; allowZoom: boolean };
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/image-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as ImagePolicyContract;

describe('image-policy-v1 contract', () => {
  it('freezes fail-closed sharing defaults', () => {
    expect(contract.version).toBe(1);
    expect(DEFAULT_READER_IMAGE_POLICY).toEqual(contract.defaults);
  });

  for (const testCase of contract.cases) {
    it(`normalizes ${testCase.name}`, () => {
      const action = () => normalizeReaderImagePolicy(testCase.policy ?? undefined);
      if (testCase.expectedError) {
        expect(action).toThrow(TypeError);
        return;
      }
      const policy = action();
      expect(policy).toEqual(testCase.expected);
      if (testCase.uses) {
        expect({
          share: readerImageUseAllowed(policy, 'share'),
          zoom: readerImageUseAllowed(policy, 'zoom'),
        }).toEqual(testCase.uses);
      }
    });
  }
});
