import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RELEASE_RELEVANT_PATHS = [
  'packages/native-epub-kit/android/',
  'packages/native-epub-kit/ios/',
  'packages/native-epub-kit/plugin/',
  'packages/native-epub-kit/src/',
];

export function isReleaseRelevant(path) {
  return (
    path === 'packages/native-epub-kit/expo-module.config.json' ||
    path === 'packages/native-epub-kit/package.json' ||
    RELEASE_RELEVANT_PATHS.some((prefix) => path.startsWith(prefix))
  );
}

export function isChangeset(path) {
  return /^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(path);
}

export function evaluateChangesetRequirement(paths) {
  const releaseRelevant = paths.filter(isReleaseRelevant);
  const changesets = paths.filter(isChangeset);

  return {
    changesets,
    releaseRelevant,
    satisfied: releaseRelevant.length === 0 || changesets.length > 0,
  };
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run() {
  const base = readArgument('--base');

  if (!base) {
    console.error('Usage: pnpm changeset:check --base <git-ref>');
    process.exitCode = 2;
    return;
  }

  const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf8',
  });
  const paths = output.split('\n').filter(Boolean);
  const result = evaluateChangesetRequirement(paths);

  if (!result.satisfied) {
    console.error('A Changeset is required for publishable native-epub-kit changes.');
    console.error(`Release-relevant paths: ${result.releaseRelevant.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    result.releaseRelevant.length === 0
      ? 'No release-relevant package changes detected.'
      : `Changeset requirement satisfied by: ${result.changesets.join(', ')}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
