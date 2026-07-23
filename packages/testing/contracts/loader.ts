import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type JsonValue =
  boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

export type ContractFixture = Readonly<{
  schemaVersion: 1;
  caseId: string;
  recordType: string;
  payload: JsonValue;
  expectations: Readonly<{
    requiredJsonPointers: string[];
    explicitNullJsonPointers: string[];
  }>;
}>;

export type JsonPointerResult =
  Readonly<{ found: true; value: JsonValue }> | Readonly<{ found: false }>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value) && Object.values(value).every(isJsonValue);
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError(`${field} must be an array of strings.`);
  }
  return value;
}

function parseFixture(value: unknown, fileName: string): ContractFixture {
  if (!isJsonObject(value)) {
    throw new TypeError(`${fileName} must contain a JSON object.`);
  }
  if (value.schemaVersion !== 1) {
    throw new TypeError(`${fileName} has an unsupported schemaVersion.`);
  }
  if (typeof value.caseId !== 'string' || value.caseId.length === 0) {
    throw new TypeError(`${fileName} must define a caseId.`);
  }
  if (typeof value.recordType !== 'string' || value.recordType.length === 0) {
    throw new TypeError(`${fileName} must define a recordType.`);
  }
  if (!isJsonValue(value.payload)) {
    throw new TypeError(`${fileName} contains a non-JSON payload.`);
  }
  if (!isJsonObject(value.expectations)) {
    throw new TypeError(`${fileName} must define expectations.`);
  }

  return {
    schemaVersion: 1,
    caseId: value.caseId,
    recordType: value.recordType,
    payload: value.payload,
    expectations: {
      requiredJsonPointers: readStringArray(
        value.expectations.requiredJsonPointers,
        `${fileName}.expectations.requiredJsonPointers`
      ),
      explicitNullJsonPointers: readStringArray(
        value.expectations.explicitNullJsonPointers,
        `${fileName}.expectations.explicitNullJsonPointers`
      ),
    },
  };
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function readJsonPointer(root: JsonValue, pointer: string): JsonPointerResult {
  if (pointer === '') {
    return { found: true, value: root };
  }
  if (!pointer.startsWith('/')) {
    throw new TypeError(`Invalid JSON pointer: ${pointer}`);
  }

  let current: JsonValue = root;
  for (const encodedSegment of pointer.slice(1).split('/')) {
    const segment = decodePointerSegment(encodedSegment);
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false };
      }
      current = current[index]!;
      continue;
    }
    if (isJsonObject(current) && Object.hasOwn(current, segment)) {
      const next = current[segment];
      if (!isJsonValue(next)) {
        return { found: false };
      }
      current = next;
      continue;
    }
    return { found: false };
  }
  return { found: true, value: current };
}

export function fixtureAsJsonValue(fixture: ContractFixture): JsonValue {
  return fixture as unknown as JsonValue;
}

export async function loadContractFixtures(directory: string): Promise<ContractFixture[]> {
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();
  return Promise.all(
    fileNames.map(async (fileName) => {
      const contents = await readFile(join(directory, fileName), 'utf8');
      return parseFixture(JSON.parse(contents), fileName);
    })
  );
}
