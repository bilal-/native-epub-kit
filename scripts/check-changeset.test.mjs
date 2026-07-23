import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateChangesetRequirement,
  isChangeset,
  isReleaseRelevant,
} from './check-changeset.mjs';

test('detects release-relevant core package paths', () => {
  assert.equal(isReleaseRelevant('packages/native-epub-kit/src/index.ts'), true);
  assert.equal(isReleaseRelevant('packages/native-epub-kit/ios/Reader.swift'), true);
  assert.equal(isReleaseRelevant('packages/native-epub-kit/README.md'), false);
  assert.equal(isReleaseRelevant('apps/example/App.tsx'), false);
});

test('recognizes authored Changesets but not the directory README', () => {
  assert.equal(isChangeset('.changeset/calm-books-read.md'), true);
  assert.equal(isChangeset('.changeset/README.md'), false);
});

test('requires a Changeset only for publishable package changes', () => {
  assert.deepEqual(evaluateChangesetRequirement(['apps/example/App.tsx']).satisfied, true);
  assert.deepEqual(
    evaluateChangesetRequirement(['packages/native-epub-kit/android/build.gradle']).satisfied,
    false
  );
  assert.deepEqual(
    evaluateChangesetRequirement([
      'packages/native-epub-kit/android/build.gradle',
      '.changeset/calm-books-read.md',
    ]).satisfied,
    true
  );
});
