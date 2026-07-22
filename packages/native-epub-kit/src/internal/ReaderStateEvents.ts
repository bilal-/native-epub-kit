import type {
  ReaderErrorEvent,
  ReaderReadyEvent,
  ReaderState,
  ReaderStateChangeEvent,
} from '../EpubReaderView.types.ts';
import { mapNativeReaderError } from '../recordValidation.ts';

export interface ReaderStateEventHandlers {
  onError?: (event: ReaderErrorEvent) => void;
  onReady?: (event: ReaderReadyEvent) => void;
  onStateChange?: (event: ReaderStateChangeEvent) => void;
}

/** Applies the frozen callback order to one exactly-once native state event. */
export function dispatchReaderStateEvent(
  state: ReaderState,
  handlers: ReaderStateEventHandlers
): void {
  const identity = {
    generation: state.generation,
    instanceId: state.instanceId,
    sequence: state.sequence,
  };
  const error =
    state.state === 'error'
      ? mapNativeReaderError({
          code: state.code ?? 'NATIVE_INVARIANT_VIOLATION',
          message: state.message ?? 'The native reader entered an error state.',
          phase: state.phase ?? 'render',
          recoverable: state.recoverable ?? false,
        })
      : undefined;

  if (error) handlers.onError?.({ ...identity, error });
  handlers.onStateChange?.({ ...identity, ...(error ? { error } : {}), state: state.state });
  if (state.state === 'ready') handlers.onReady?.({ ...identity, state: 'ready' });
}
