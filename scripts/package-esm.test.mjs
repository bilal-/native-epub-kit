import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  assertResolvableRuntimeSpecifiers,
} = require('../packages/native-epub-kit/internal/module_scripts/util.js');

test('accepts explicit relative Node ESM runtime extensions', () => {
  const root = mkdtempSync(join(tmpdir(), 'native-epub-kit-esm-'));
  try {
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'index.mjs'), "export * from './nested/value.js';\n");
    writeFileSync(join(root, 'nested/value.js'), 'export const value = 1;\n');
    assert.doesNotThrow(() => assertResolvableRuntimeSpecifiers(root));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('rejects extensionless relative Node ESM runtime imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'native-epub-kit-esm-'));
  try {
    writeFileSync(join(root, 'index.js'), "import './records';\n");
    assert.throws(
      () => assertResolvableRuntimeSpecifiers(root),
      /Unresolvable Node ESM specifier "\.\/records"/
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
