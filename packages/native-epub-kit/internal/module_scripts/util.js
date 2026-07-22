const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// On Windows, executables like `tsc` and `jest` are `.cmd` batch files and cannot be
// spawned directly — they require shell: true to resolve. On Unix, shell: true is
// unnecessary.
function spawnSyncWithAutoShell(command, args, options) {
  return spawnSync(command, args, { ...options, shell: process.platform === 'win32' });
}

function assertResolvableRuntimeSpecifiers(directory) {
  const relativeSpecifier = /\b(?:from|import)\s*(?:\(\s*)?["'](\.\.?\/[^"']+)["']/g;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assertResolvableRuntimeSpecifiers(entryPath);
      continue;
    }
    if (!/\.(?:c|m)?js$/.test(entry.name)) continue;

    const source = fs.readFileSync(entryPath, 'utf8');
    for (const match of source.matchAll(relativeSpecifier)) {
      const specifier = match[1];
      if (/\.(?:c|m)?js$|\.json$|\.node$/.test(specifier)) continue;
      throw new Error(
        `Unresolvable Node ESM specifier ${JSON.stringify(specifier)} in ${path.relative(
          directory,
          entryPath
        )}. Author relative TypeScript imports with an explicit .ts/.tsx extension.`
      );
    }
  }
}

function finalizeMainBuild(packageDirectory) {
  const buildDirectory = path.join(packageDirectory, 'build');
  fs.mkdirSync(buildDirectory, { recursive: true });
  fs.writeFileSync(path.join(buildDirectory, 'package.json'), '{"type":"module"}\n');

  const rewriteDeclarations = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        rewriteDeclarations(entryPath);
        continue;
      }
      if (!entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.mts')) continue;

      const source = fs.readFileSync(entryPath, 'utf8');
      const rewritten = source.replace(
        /(\bfrom\s+['"])(\.\.?\/[^'"]+)(['"])/g,
        (_match, prefix, specifier, suffix) => {
          if (/\.(?:c|m)?js$|\.json$/.test(specifier)) return `${prefix}${specifier}${suffix}`;
          const runtimeSpecifier = specifier.replace(/\.tsx?$/, '.js');
          return `${prefix}${runtimeSpecifier === specifier ? `${specifier}.js` : runtimeSpecifier}${suffix}`;
        }
      );
      if (rewritten !== source) fs.writeFileSync(entryPath, rewritten);
    }
  };

  rewriteDeclarations(buildDirectory);
  // The default package export is native-free Node ESM. Metro accepts the
  // same explicit runtime extensions, and this guard prevents a clean package
  // from shipping extensionless imports that only happen to work in a bundler.
  assertResolvableRuntimeSpecifiers(buildDirectory);
}

module.exports = {
  assertResolvableRuntimeSpecifiers,
  finalizeMainBuild,
  spawnSyncWithAutoShell,
};
