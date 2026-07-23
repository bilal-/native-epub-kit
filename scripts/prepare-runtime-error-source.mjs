import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [platform, device] = process.argv.slice(2).filter((argument) => argument !== '--');
if (!['ios', 'android'].includes(platform) || !device) {
  throw new Error('Usage: node scripts/prepare-runtime-error-source.mjs <ios|android> <device>');
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repositoryRoot, 'packages/testing/fixtures/adversarial/unreadable.epub');
const fileName = 'native-epub-kit-unreadable.epub';
const bundleId = 'com.bilal.nativeepubkit.example';

if (platform === 'ios') {
  const container = execFileSync(
    'xcrun',
    ['simctl', 'get_app_container', device, bundleId, 'data'],
    { encoding: 'utf8' }
  ).trim();
  const destination = join(container, 'Documents', fileName);
  if (existsSync(destination)) {
    chmodSync(destination, 0o600);
    unlinkSync(destination);
  }
  copyFileSync(source, destination);
  chmodSync(destination, 0);
  console.log(`Prepared unreadable iOS source at file://${destination}`);
} else {
  const remoteStaging = `/data/local/tmp/${fileName}`;
  execFileSync('adb', ['-s', device, 'push', source, remoteStaging], { stdio: 'inherit' });
  execFileSync(
    'adb',
    ['-s', device, 'shell', 'run-as', bundleId, 'rm', '-f', `files/${fileName}`],
    { stdio: 'inherit' }
  );
  execFileSync(
    'adb',
    ['-s', device, 'shell', 'run-as', bundleId, 'cp', remoteStaging, `files/${fileName}`],
    { stdio: 'inherit' }
  );
  execFileSync(
    'adb',
    ['-s', device, 'shell', 'run-as', bundleId, 'chmod', '000', `files/${fileName}`],
    { stdio: 'inherit' }
  );
  console.log(`Prepared unreadable Android source in ${bundleId}/files/${fileName}`);
}
