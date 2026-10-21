import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('Search qualification requires macOS/Xcode.');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing required ${name}.`);
  return value;
};
const device = argument('--device');
const products = resolve(argument('--products-directory'));
const pods = resolve(argument('--pods-directory'));
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const run = (args, capture = false) => {
  const result = spawnSync('xcrun', args, {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`xcrun ${args[0]} failed: ${result.stderr ?? result.status}`);
  return result.stdout?.trim();
};
const devices = JSON.parse(run(['simctl', 'list', 'devices', '--json'], true));
if (
  !Object.values(devices.devices)
    .flat()
    .some((item) => item.udid === device && item.state === 'Booted')
) {
  throw new Error('The explicitly selected simulator must already be booted.');
}
const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
const sdk = run(['--sdk', 'iphonesimulator', '--show-sdk-path'], true);
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'native-epub-search-'));
try {
  const executable = join(temporaryDirectory, 'search-harness');
  const args = [
    'swiftc',
    '-parse-as-library',
    '-sdk',
    sdk,
    '-target',
    `${architecture}-apple-ios18.0-simulator`,
    resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderSearchContentExtractor.swift'),
    resolve(repositoryRoot, 'packages/testing/native/swift-search-content/Main.swift'),
    '-o',
    executable,
  ];
  for (const name of [
    'ReadiumShared',
    'ReadiumFuzi',
    'ReadiumInternal',
    'ReadiumZIPFoundation',
    'SwiftSoup',
    'Minizip',
  ]) {
    const directory = join(products, name);
    args.push('-I', directory, '-L', directory, `-l${name}`);
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.modulemap'))) {
      args.push('-Xcc', `-fmodule-map-file=${join(directory, file)}`);
    }
  }
  args.push(
    '-Xcc',
    `-fmodule-map-file=${join(pods, 'Headers/Public/Minizip/Minizip.modulemap')}`,
    '-Xcc',
    `-I${join(pods, 'Headers/Public')}`,
    '-Xcc',
    `-I${sdk}/usr/include/libxml2`,
    '-lxml2',
    '-lz'
  );
  run(args);
  run([
    'simctl',
    'spawn',
    device,
    executable,
    ...(process.argv.includes('--default-extractor') ? ['--default-extractor'] : []),
  ]);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
