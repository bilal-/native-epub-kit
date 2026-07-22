#!/usr/bin/env node
const { finalizeMainBuild, spawnSyncWithAutoShell } = require('./util');
const fs = require('fs');
const path = require('path');

const SUBTARGETS = ['plugin', 'cli', 'utils', 'scripts'];
const args = process.argv.slice(2);
const target = args[0];

let tscArgs;
if (SUBTARGETS.includes(target)) {
  const targetDir = path.join(process.cwd(), target);
  if (!fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    console.log(`tsconfig.json not found in ${target}, skipping build for ${target}`);
    process.exit(0);
  }
  tscArgs = ['--build', targetDir, ...args.slice(1)];
} else {
  tscArgs = [...args];
}

// Keep generated JavaScript ESM without changing the package root, where Expo
// intentionally loads app.plugin.js as CommonJS.
const buildDirectory = path.join(process.cwd(), 'build');
fs.mkdirSync(buildDirectory, { recursive: true });
fs.writeFileSync(path.join(buildDirectory, 'package.json'), '{"type":"module"}\n');

if (
  process.stdout.isTTY &&
  !process.env.CI &&
  !process.env.EXPO_NONINTERACTIVE &&
  !tscArgs.includes('--watch')
) {
  tscArgs.push('--watch');
}

const result = spawnSyncWithAutoShell('tsc', tscArgs, { stdio: 'inherit' });
if (result.status === 0 && !SUBTARGETS.includes(target) && !tscArgs.includes('--watch')) {
  finalizeMainBuild(process.cwd());
}
process.exit(result.status ?? 0);
