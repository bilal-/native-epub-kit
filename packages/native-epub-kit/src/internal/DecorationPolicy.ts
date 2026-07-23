import { parseLocator, parseReaderDecoration } from '../recordValidation.ts';
import {
  DECORATION_CHANGE_TYPES,
  DECORATION_CUSTOM_TEMPLATES,
  DECORATION_MARGIN_ICON_ASSETS,
  type JsonValue,
  type ReaderDecoration,
  type ReaderDecorationChange,
  type ReaderDecorationCustomConfig,
  type ReaderDecorationStyle,
} from '../records.ts';

export const MAXIMUM_DECORATION_GROUPS = 32;
export const MAXIMUM_DECORATIONS_PER_GROUP = 10_000;
export const MAXIMUM_DECORATION_CHANGES = 2_048;
export const MAXIMUM_DECORATION_GROUP_UTF16_UNITS = 64;
export const MAXIMUM_DECORATION_ID_UTF16_UNITS = 128;
export const MAXIMUM_DECORATION_DATA_UTF8_BYTES = 8_192;

export const DEFAULT_DECORATION_TINT = '#e8c97a';
export const DEFAULT_MARGIN_ICON_TINT = '#64748b';

const GROUP_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TINT_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const changeTypes = new Set<string>(DECORATION_CHANGE_TYPES);
const marginIconAssets = new Set<string>(DECORATION_MARGIN_ICON_ASSETS);
const customTemplates = new Set<string>(DECORATION_CUSTOM_TEMPLATES);

function reject(message: string): never {
  throw new TypeError(`Invalid reader decoration: ${message}`);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    reject(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) reject(`${name} contains unsupported field ${JSON.stringify(key)}.`);
  }
}

function identifier(value: unknown, name: 'group' | 'id'): string {
  if (typeof value !== 'string') reject(`${name} must be a string.`);
  const normalized = value.normalize('NFC').trim();
  const limit =
    name === 'group' ? MAXIMUM_DECORATION_GROUP_UTF16_UNITS : MAXIMUM_DECORATION_ID_UTF16_UNITS;
  const pattern = name === 'group' ? GROUP_PATTERN : ID_PATTERN;
  if (normalized.length === 0 || normalized.length > limit || !pattern.test(normalized)) {
    reject(`${name} has an unsupported format.`);
  }
  return normalized;
}

function tint(value: unknown, fallback?: string): string {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'string' || !TINT_PATTERN.test(resolved)) {
    reject('tint must use #RRGGBB or #RRGGBBAA.');
  }
  return resolved.toLowerCase();
}

function optionalBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') reject('isActive must be a boolean.');
  return value;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== 'number' ||
    !Number.isFinite(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    reject(`${name} must be within ${minimum}...${maximum}.`);
  }
  return resolved;
}

function normalizeCustomConfig(value: unknown): Required<ReaderDecorationCustomConfig> {
  const parsed = value === undefined ? {} : object(value, 'custom config');
  exactKeys(
    parsed,
    ['borderRadius', 'borderWidth', 'fillOpacity', 'isActive', 'tint'],
    'custom config'
  );
  return {
    borderRadius: boundedNumber(parsed.borderRadius, 4, 0, 12, 'borderRadius'),
    borderWidth: boundedNumber(parsed.borderWidth, 2, 1, 4, 'borderWidth'),
    fillOpacity: boundedNumber(parsed.fillOpacity, 0.12, 0, 0.5, 'fillOpacity'),
    isActive: optionalBoolean(parsed.isActive),
    tint: tint(parsed.tint, DEFAULT_DECORATION_TINT),
  };
}

function normalizeStyle(value: unknown): ReaderDecorationStyle {
  const parsed = object(value, 'style');
  if (typeof parsed.type !== 'string') reject('style.type must be a string.');
  switch (parsed.type) {
    case 'highlight':
    case 'underline':
      exactKeys(parsed, ['isActive', 'tint', 'type'], `${parsed.type} style`);
      return {
        isActive: optionalBoolean(parsed.isActive),
        tint: tint(parsed.tint),
        type: parsed.type,
      };
    case 'margin-icon': {
      exactKeys(parsed, ['asset', 'tint', 'type'], 'margin-icon style');
      if (typeof parsed.asset !== 'string' || !marginIconAssets.has(parsed.asset)) {
        reject('margin-icon asset is unsupported.');
      }
      return {
        asset: parsed.asset as (typeof DECORATION_MARGIN_ICON_ASSETS)[number],
        tint: tint(parsed.tint, DEFAULT_MARGIN_ICON_TINT),
        type: 'margin-icon',
      };
    }
    case 'custom': {
      exactKeys(parsed, ['config', 'template', 'type'], 'custom style');
      if (typeof parsed.template !== 'string' || !customTemplates.has(parsed.template)) {
        reject('custom template is unsupported.');
      }
      return {
        config: normalizeCustomConfig(parsed.config),
        template: parsed.template as (typeof DECORATION_CUSTOM_TEMPLATES)[number],
        type: 'custom',
      };
    }
    default:
      return reject('style.type is unsupported.');
  }
}

function dataSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function normalizeReaderDecorationGroup(value: unknown): string {
  return identifier(value, 'group');
}

export function normalizeReaderDecoration(value: unknown): ReaderDecoration {
  const parsed = object(value, 'record');
  exactKeys(parsed, ['data', 'id', 'locator', 'style'], 'record');
  const normalized: ReaderDecoration = {
    id: identifier(parsed.id, 'id'),
    locator: parseLocator(parsed.locator),
    style: normalizeStyle(parsed.style),
    ...(Object.hasOwn(parsed, 'data') ? { data: parsed.data as JsonValue } : {}),
  };
  const validated = parseReaderDecoration(normalized);
  if (
    validated.data !== undefined &&
    dataSize(validated.data) > MAXIMUM_DECORATION_DATA_UTF8_BYTES
  ) {
    reject(`data exceeds ${MAXIMUM_DECORATION_DATA_UTF8_BYTES} UTF-8 bytes.`);
  }
  return validated;
}

export function normalizeReaderDecorations(
  group: unknown,
  values: readonly ReaderDecoration[]
): { decorations: ReaderDecoration[]; group: string } {
  const normalizedGroup = normalizeReaderDecorationGroup(group);
  if (!Array.isArray(values)) reject('decorations must be an array.');
  if (values.length > MAXIMUM_DECORATIONS_PER_GROUP) {
    reject(`a group may contain at most ${MAXIMUM_DECORATIONS_PER_GROUP} decorations.`);
  }
  const ids = new Set<string>();
  const decorations = values.map((value) => {
    const decoration = normalizeReaderDecoration(value);
    if (ids.has(decoration.id)) reject(`id ${JSON.stringify(decoration.id)} is duplicated.`);
    ids.add(decoration.id);
    return decoration;
  });
  return { decorations, group: normalizedGroup };
}

export function normalizeReaderDecorationChanges(
  group: unknown,
  values: readonly ReaderDecorationChange[]
): { changes: ReaderDecorationChange[]; group: string } {
  const normalizedGroup = normalizeReaderDecorationGroup(group);
  if (!Array.isArray(values)) reject('changes must be an array.');
  if (values.length > MAXIMUM_DECORATION_CHANGES) {
    reject(`one delta may contain at most ${MAXIMUM_DECORATION_CHANGES} changes.`);
  }
  const changes = values.map((value) => {
    const parsed = object(value, 'change');
    if (typeof parsed.type !== 'string' || !changeTypes.has(parsed.type)) {
      reject('change.type is unsupported.');
    }
    if (parsed.type === 'remove') {
      exactKeys(parsed, ['id', 'type'], 'remove change');
      return { id: identifier(parsed.id, 'id'), type: 'remove' } as const;
    }
    exactKeys(parsed, ['decoration', 'type'], `${parsed.type} change`);
    return {
      decoration: normalizeReaderDecoration(parsed.decoration),
      type: parsed.type as 'add' | 'update',
    };
  });
  return { changes, group: normalizedGroup };
}

export function applyReaderDecorationChanges(
  current: readonly ReaderDecoration[],
  changes: readonly ReaderDecorationChange[]
): ReaderDecoration[] {
  const next = current.map(normalizeReaderDecoration);
  const indexById = new Map(next.map((decoration, index) => [decoration.id, index]));
  for (const change of changes) {
    if (change.type === 'add') {
      if (indexById.has(change.decoration.id)) {
        reject(`add references existing id ${JSON.stringify(change.decoration.id)}.`);
      }
      if (next.length >= MAXIMUM_DECORATIONS_PER_GROUP) {
        reject(`a group may contain at most ${MAXIMUM_DECORATIONS_PER_GROUP} decorations.`);
      }
      indexById.set(change.decoration.id, next.length);
      next.push(change.decoration);
      continue;
    }
    const id = change.type === 'remove' ? change.id : change.decoration.id;
    const index = indexById.get(id);
    if (index === undefined) reject(`${change.type} references missing id ${JSON.stringify(id)}.`);
    if (change.type === 'update') {
      next[index] = change.decoration;
      continue;
    }
    next.splice(index, 1);
    indexById.clear();
    next.forEach((decoration, nextIndex) => indexById.set(decoration.id, nextIndex));
  }
  return next;
}
