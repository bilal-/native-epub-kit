import assert from 'node:assert/strict';
import test from 'node:test';

import { findDeniedLicenses } from './check-licenses.mjs';

test('reports only explicitly denied license expressions', () => {
  assert.deepEqual(findDeniedLicenses(['MIT', 'SSPL-1.0', 'Apache-2.0', 'AGPL-3.0-only']), [
    'AGPL-3.0-only',
    'SSPL-1.0',
  ]);
});
