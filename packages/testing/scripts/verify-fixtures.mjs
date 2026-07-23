import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtures } from './build-fixtures.mjs';
import { ensureEpubcheck, runEpubcheck } from './epubcheck.mjs';

const testingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = join(testingRoot, 'fixtures');
const committedOutput = join(fixturesRoot, 'generated');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function snapshotDirectory(directory) {
  const names = (await readdir(directory)).sort();
  const entries = await Promise.all(
    names.map(async (name) => {
      const value = await readFile(join(directory, name));
      return [name, { hash: sha256(value), value }];
    })
  );
  return new Map(entries);
}

function compareSnapshots(expected, actual, label) {
  const expectedNames = [...expected.keys()];
  const actualNames = [...actual.keys()];
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
    throw new Error(
      `${label} file list differs: ${expectedNames.join(', ')} != ${actualNames.join(', ')}`
    );
  }
  for (const name of expectedNames) {
    if (expected.get(name).hash !== actual.get(name).hash) {
      throw new Error(
        `${label} differs for ${name}. Run pnpm fixtures:build and review the change.`
      );
    }
  }
}

function verifyEpubContainer(value, fileName) {
  if (value.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`${fileName} does not start with a ZIP local-file header.`);
  }
  if (value.readUInt16LE(8) !== 0) {
    throw new Error(`${fileName} compresses its mimetype entry.`);
  }
  const fileNameLength = value.readUInt16LE(26);
  const firstName = value.subarray(30, 30 + fileNameLength).toString('utf8');
  if (firstName !== 'mimetype') {
    throw new Error(`${fileName} does not place mimetype first.`);
  }
}

function validateExpectedOutcome(fixture, result) {
  const messageIds = new Set(result.messages.map((message) => message.id));
  const blockingMessages = result.messages.filter((message) =>
    ['ERROR', 'FATAL'].includes(message.severity)
  );

  if (fixture.validation.outcome === 'valid') {
    if (result.exitCode !== 0 || blockingMessages.length > 0) {
      throw new Error(
        `${fixture.file} should be valid, but EPUBCheck returned ${result.exitCode}: ${blockingMessages.map((message) => `${message.severity}/${message.id}`).join(', ')}`
      );
    }
    return;
  }

  if (result.exitCode === 0 || blockingMessages.length === 0) {
    throw new Error(`${fixture.file} is a negative fixture, but EPUBCheck accepted it.`);
  }
  for (const requiredId of fixture.validation.requiredMessageIds ?? []) {
    if (!messageIds.has(requiredId)) {
      throw new Error(
        `${fixture.file} did not produce required EPUBCheck message ${requiredId}; got ${[...messageIds].join(', ')}.`
      );
    }
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'native-epub-kit-fixtures-'));
try {
  const firstOutput = join(temporaryRoot, 'first');
  const secondOutput = join(temporaryRoot, 'second');
  const reportDirectory = join(temporaryRoot, 'epubcheck-reports');
  await mkdir(reportDirectory, { recursive: true });
  const firstManifest = await buildFixtures(firstOutput);
  await buildFixtures(secondOutput);

  const firstSnapshot = await snapshotDirectory(firstOutput);
  const secondSnapshot = await snapshotDirectory(secondOutput);
  const committedSnapshot = await snapshotDirectory(committedOutput);
  compareSnapshots(firstSnapshot, secondSnapshot, 'Two clean fixture builds');
  compareSnapshots(firstSnapshot, committedSnapshot, 'Generated fixture output');

  for (const fixture of firstManifest.fixtures) {
    verifyEpubContainer(firstSnapshot.get(fixture.file).value, fixture.file);
  }

  const { configuration, jar } = await ensureEpubcheck();
  const summaries = [];
  for (const fixture of firstManifest.fixtures) {
    const result = await runEpubcheck({
      epubPath: join(firstOutput, fixture.file),
      jar,
      reportDirectory,
    });
    validateExpectedOutcome(fixture, result);
    summaries.push({
      file: fixture.file,
      messageIds: [...new Set(result.messages.map((message) => message.id))].sort(),
      outcome: fixture.validation.outcome,
    });
  }

  console.log(
    `Verified ${firstManifest.fixtures.length} byte-reproducible fixtures with EPUBCheck ${configuration.version}.`
  );
  for (const summary of summaries) {
    const messages = summary.messageIds.length ? summary.messageIds.join(', ') : 'clean';
    console.log(`${summary.file}  ${summary.outcome}  ${messages}`);
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
