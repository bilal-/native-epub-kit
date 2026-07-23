import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ReaderLocationReason } from '../records';
import {
  LOCATION_EVENT_THROTTLE_MILLISECONDS,
  ReaderEventProtocol,
  readerCommandErrorCode,
  type StableReaderState,
} from './ReaderEventProtocol';

interface ReaderApiContract {
  version: number;
  locationThrottleMilliseconds: number;
  commandCases: {
    state: StableReaderState;
    destroyed: boolean;
    errorCode: 'READER_DESTROYED' | 'READER_NOT_READY' | null;
  }[];
  eventCases: {
    name: string;
    steps: (
      | {
          kind: 'event';
          generation: number;
          accepted: boolean;
          sequence: number | null;
        }
      | {
          kind: 'location';
          generation: number;
          reason: ReaderLocationReason;
          timestampMilliseconds: number;
          accepted: boolean;
          sequence: number | null;
        }
    )[];
  }[];
}

const contractPath = fileURLToPath(
  new URL('../../../testing/contracts/reader-api-v1/cases.json', import.meta.url)
);
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as ReaderApiContract;

describe('stable reader event and command protocol', () => {
  it('matches the frozen protocol constants and command readiness matrix', () => {
    expect(contract.version).toBe(1);
    expect(LOCATION_EVENT_THROTTLE_MILLISECONDS).toBe(contract.locationThrottleMilliseconds);
    for (const testCase of contract.commandCases) {
      expect(readerCommandErrorCode(testCase.state, testCase.destroyed)).toBe(testCase.errorCode);
    }
  });

  for (const testCase of contract.eventCases) {
    it(testCase.name, () => {
      const protocol = new ReaderEventProtocol();
      for (const step of testCase.steps) {
        const sequence =
          step.kind === 'event'
            ? protocol.nextEvent(step.generation)
            : protocol.nextLocation(step.generation, step.reason, step.timestampMilliseconds);
        expect(sequence !== null).toBe(step.accepted);
        expect(sequence).toBe(step.sequence);
      }
    });
  }
});
