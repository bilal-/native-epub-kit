import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ReaderLifecycleGate, type QualificationReaderState } from './ReaderLifecycleGate';

interface LifecycleContract {
  version: number;
  cases: {
    name: string;
    steps: {
      generation: number;
      state: QualificationReaderState;
      accepted: boolean;
    }[];
  }[];
}

const contractPath = fileURLToPath(
  new URL('../../../testing/contracts/lifecycle-v0/cases.json', import.meta.url)
);
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as LifecycleContract;

describe('ReaderLifecycleGate shared contract', () => {
  it('uses the expected contract version', () => {
    expect(contract.version).toBe(1);
  });

  for (const testCase of contract.cases) {
    it(testCase.name, () => {
      const gate = new ReaderLifecycleGate();

      for (const step of testCase.steps) {
        expect(gate.accept(step.state, step.generation)).toBe(step.accepted);
      }
    });
  }
});
