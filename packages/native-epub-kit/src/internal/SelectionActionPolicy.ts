import type {
  ReaderSelectionAction,
  ResolvedReaderSelectionAction,
  TextDirection,
} from '../records.ts';

export const MAXIMUM_SELECTION_ACTIONS = 8;
export const MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS = 64;
export const MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS = 64;
export const MAXIMUM_SELECTION_TEXT_UTF16_UNITS = 8_192;
export const MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS = 512;

const actionIdPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const rtlRanges = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u{1ee00}-\u{1eeff}]/u;
const letter = /\p{L}/u;

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}/${key}`, 'is not supported');
  }
}

function normalizeTitle(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS) {
    fail(path, `must contain 1-${MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS} UTF-16 units`);
  }
  if (/\p{Cc}/u.test(normalized)) fail(path, 'must not contain control characters');
  return normalized;
}

function normalizeAction(value: unknown, index: number): ResolvedReaderSelectionAction {
  const path = `$/actions/${index}`;
  const input = object(value, path);
  exactKeys(input, ['id', 'title'], path);
  if (typeof input.id !== 'string') fail(`${path}/id`, 'must be a string');
  const id = input.id.trim();
  if (
    id.length === 0 ||
    id.length > MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS ||
    !actionIdPattern.test(id)
  ) {
    fail(
      `${path}/id`,
      `must match ${actionIdPattern.source} within ${MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS} UTF-16 units`
    );
  }
  return { id, title: normalizeTitle(input.title, `${path}/title`) };
}

/** Validates and detaches the custom native selection-menu configuration. */
export function normalizeReaderSelectionActions(
  value?: readonly ReaderSelectionAction[]
): ResolvedReaderSelectionAction[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('$/actions', 'must be an array');
  if (value.length > MAXIMUM_SELECTION_ACTIONS) {
    fail('$/actions', `must contain at most ${MAXIMUM_SELECTION_ACTIONS} actions`);
  }
  const actions = value.map(normalizeAction);
  const ids = new Set<string>();
  for (const [index, action] of actions.entries()) {
    if (ids.has(action.id)) fail(`$/actions/${index}/id`, 'must be unique');
    ids.add(action.id);
  }
  return actions;
}

/** Conservative first-strong direction inference for stable action metadata. */
export function selectionTextDirection(value: string): TextDirection {
  for (const scalar of value) {
    if (rtlRanges.test(scalar)) return 'rtl';
    if (letter.test(scalar)) return 'ltr';
  }
  return 'auto';
}
