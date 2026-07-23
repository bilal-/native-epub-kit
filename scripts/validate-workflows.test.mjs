import assert from 'node:assert/strict';
import test from 'node:test';

import { validateWorkflowSource } from './validate-workflows.mjs';

const SHA = '1234567890abcdef1234567890abcdef12345678';

test('accepts a read-only workflow with immutable action references', () => {
  const errors = validateWorkflowSource(
    `
name: Check
on: pull_request
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@${SHA}
      - run: pnpm test
`,
    'check.yml'
  );

  assert.deepEqual(errors, []);
});

test('rejects mutable actions, write permissions, and publishing', () => {
  const errors = validateWorkflowSource(
    `
name: Unsafe
on: pull_request_target
permissions: write-all
jobs:
  release:
    runs-on: ubuntu-24.04
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v7
      - run: npm publish
`,
    'unsafe.yml'
  );

  assert.equal(errors.length, 4);
});
