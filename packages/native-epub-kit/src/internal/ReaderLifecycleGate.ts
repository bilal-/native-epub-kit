export type QualificationReaderState =
  'idle' | 'opening' | 'waitingForHost' | 'ready' | 'error' | 'closing' | 'unmounted';

const newGenerationStates = new Set<QualificationReaderState>([
  'idle',
  'opening',
  'closing',
  'unmounted',
]);

const transitions: Record<QualificationReaderState, ReadonlySet<QualificationReaderState>> = {
  idle: new Set(['opening', 'unmounted']),
  opening: new Set(['waitingForHost', 'ready', 'error', 'closing', 'unmounted']),
  waitingForHost: new Set(['ready', 'error', 'closing', 'unmounted']),
  ready: new Set(['error', 'closing', 'unmounted']),
  error: new Set(['closing', 'idle', 'opening', 'unmounted']),
  closing: new Set(['idle', 'opening', 'unmounted']),
  unmounted: new Set(['idle', 'opening']),
};

/**
 * Qualification mirror of the native event gate. It is intentionally not part
 * of the public package export surface.
 */
export class ReaderLifecycleGate {
  private generation = -1;
  private state: QualificationReaderState | null = null;

  accept(nextState: QualificationReaderState, nextGeneration: number): boolean {
    if (!Number.isSafeInteger(nextGeneration) || nextGeneration < 0) return false;
    if (nextGeneration < this.generation) return false;

    if (nextGeneration > this.generation) {
      if (!newGenerationStates.has(nextState)) return false;
      this.generation = nextGeneration;
      this.state = nextState;
      return true;
    }

    if (this.state === null) {
      if (!newGenerationStates.has(nextState)) return false;
      this.state = nextState;
      return true;
    }

    if (this.state === nextState || !transitions[this.state].has(nextState)) return false;
    this.state = nextState;
    return true;
  }
}
