import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  throw new Error('Swift core record tests require macOS/Xcode.');
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'native-epub-kit-records-swift-'));
const executable = join(temporaryDirectory, 'core-records-harness');

try {
  const compile = spawnSync(
    'xcrun',
    [
      'swiftc',
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/SharedRecords.swift'),
      resolve(repositoryRoot, 'packages/testing/native/swift-core-records/main.swift'),
      '-o',
      executable,
    ],
    { stdio: 'inherit' }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  const run = spawnSync(
    executable,
    [resolve(repositoryRoot, 'packages/testing/contracts/core-v1')],
    { stdio: 'inherit' }
  );
  process.exit(run.status ?? 1);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
