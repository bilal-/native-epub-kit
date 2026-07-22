#!/usr/bin/env node
const { finalizeMainBuild, spawnSyncWithAutoShell } = require('./util');
const fs = require('fs');
const path = require('path');

const SUBTARGETS = ['plugin', 'cli', 'utils', 'scripts'];

function run(cmd, args = []) {
  const result = spawnSyncWithAutoShell(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Clean and build main
fs.rmSync(path.join(process.cwd(), 'build'), { recursive: true, force: true });
run('tsc');
// Keep generated JavaScript ESM without changing the package root, where Expo
// intentionally loads app.plugin.js as CommonJS. Emitted declarations also
// need runtime extensions for the package's strict NodeNext export condition.
finalizeMainBuild(process.cwd());

// Clean and build any existing subtargets
for (const target of SUBTARGETS) {
  const targetDir = path.join(process.cwd(), target);
  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    console.log(`Building ${target}`);
    fs.rmSync(path.join(targetDir, 'build'), { recursive: true, force: true });
    run('tsc', ['--build', targetDir]);
  }
}
