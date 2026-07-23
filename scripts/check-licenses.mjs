import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DENIED_LICENSES = new Set([
  'AGPL-1.0-only',
  'AGPL-1.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'SSPL-1.0',
]);

export function findDeniedLicenses(licenseNames) {
  return [...licenseNames].filter((license) => DENIED_LICENSES.has(license)).sort();
}

function run() {
  const output = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const licenses = Object.keys(JSON.parse(output));
  const denied = findDeniedLicenses(licenses);

  if (denied.length > 0) {
    console.error(`Denied production dependency licenses: ${denied.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Production dependency license check passed (${licenses.length} expressions).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
