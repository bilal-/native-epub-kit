import type { ReaderLocationReason } from '../records.ts';

export type StableReaderState =
  'idle' | 'opening' | 'waitingForHost' | 'ready' | 'error' | 'closing' | 'unmounted';

export const LOCATION_EVENT_THROTTLE_MILLISECONDS = 120;

/**
 * Owns the per-generation public event sequence and the native location-event
 * rate limit. Qualification events deliberately do not consume this sequence.
 */
export class ReaderEventProtocol {
  private generation = -1;
  private nextSequence = 0;
  private lastLocationTimestampMilliseconds: number | null = null;

  nextEvent(generation: number): number | null {
    if (!Number.isSafeInteger(generation) || generation < 0 || generation < this.generation) {
      return null;
    }
    if (generation > this.generation) {
      this.generation = generation;
      this.nextSequence = 0;
      this.lastLocationTimestampMilliseconds = null;
    }
    const sequence = this.nextSequence;
    this.nextSequence += 1;
    return sequence;
  }

  nextLocation(
    generation: number,
    reason: ReaderLocationReason,
    timestampMilliseconds: number
  ): number | null {
    if (!Number.isSafeInteger(timestampMilliseconds) || timestampMilliseconds < 0) return null;
    if (generation < this.generation) return null;
    if (generation > this.generation) {
      this.generation = generation;
      this.nextSequence = 0;
      this.lastLocationTimestampMilliseconds = null;
    }
    if (
      reason === 'user-scroll' &&
      this.lastLocationTimestampMilliseconds !== null &&
      timestampMilliseconds - this.lastLocationTimestampMilliseconds <
        LOCATION_EVENT_THROTTLE_MILLISECONDS
    ) {
      return null;
    }
    const sequence = this.nextEvent(generation);
    if (sequence === null) return null;
    this.lastLocationTimestampMilliseconds = timestampMilliseconds;
    return sequence;
  }
}

export function readerCommandErrorCode(
  state: StableReaderState,
  destroyed: boolean
): 'READER_DESTROYED' | 'READER_NOT_READY' | null {
  if (destroyed) return 'READER_DESTROYED';
  return state === 'ready' ? null : 'READER_NOT_READY';
}
