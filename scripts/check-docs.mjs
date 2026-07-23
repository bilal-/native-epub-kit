#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repositoryRoot, 'packages', 'native-epub-kit');

const requiredFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'docs/compatibility.md',
  'packages/native-epub-kit/README.md',
  'packages/native-epub-kit/docs/README.md',
  'packages/native-epub-kit/docs/api-reference.md',
  'packages/native-epub-kit/docs/getting-started.md',
  'packages/native-epub-kit/docs/product-integration.md',
  'packages/native-epub-kit/docs/recipes.md',
  'packages/native-epub-kit/docs/troubleshooting.md',
  'packages/native-epub-kit/docs/alpha-migration.md',
  'packages/native-epub-kit/docs/limitations-and-upgrades.md',
];

const errors = [];
for (const relative of requiredFiles) {
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute)) errors.push(`Missing required documentation: ${relative}`);
}

const markdownFiles = requiredFiles
  .map((relative) => path.join(repositoryRoot, relative))
  .filter((absolute) => fs.existsSync(absolute));

for (const markdownPath of markdownFiles) {
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  checkLocalLinks(markdownPath, markdown);
  checkDoctests(markdownPath, markdown);
}

const topicChecks = [
  [
    'packages/native-epub-kit/docs/recipes.md',
    ['content:', 'progress', 'footnote', 'bookmark', 'search', 'sharing', 'accessibility'],
  ],
  [
    'packages/native-epub-kit/docs/troubleshooting.md',
    ['blank', 'font', 'locator', 'fragment', 'diagnostic', 'Readium'],
  ],
  [
    'packages/native-epub-kit/docs/alpha-migration.md',
    ['0.x', 'Locator', 'persistence', 'rebuild', 'breaking'],
  ],
];

for (const [relative, topics] of topicChecks) {
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute)) continue;
  const contents = fs.readFileSync(absolute, 'utf8').toLowerCase();
  for (const topic of topics) {
    if (!contents.includes(topic.toLowerCase())) {
      errors.push(`${relative} does not cover required topic: ${topic}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Documentation checks passed (${markdownFiles.length} files, local links, required topics, and executable snippets).`
);

function checkLocalLinks(markdownPath, markdown) {
  const links = markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    const rawTarget = match[1]?.trim().replace(/^<|>$/g, '');
    if (!rawTarget || /^(?:[a-z]+:|#)/i.test(rawTarget)) continue;
    const withoutTitle = rawTarget.split(/\s+["']/)[0] ?? rawTarget;
    const fileTarget = decodeURIComponent((withoutTitle.split('#')[0] ?? '').split('?')[0] ?? '');
    if (!fileTarget) continue;
    const resolved = path.resolve(path.dirname(markdownPath), fileTarget);
    if (!fs.existsSync(resolved)) {
      errors.push(
        `${path.relative(repositoryRoot, markdownPath)} has a broken link to ${fileTarget}`
      );
    }
  }
}

function checkDoctests(markdownPath, markdown) {
  const doctests = markdown.matchAll(
    /<!--\s*doctest:\s*([^\s]+)\s*-->\s*```(?:tsx|ts)\n([\s\S]*?)```/g
  );
  for (const match of doctests) {
    const relativeExample = match[1];
    const examplePath = path.resolve(packageRoot, 'docs', relativeExample);
    if (!fs.existsSync(examplePath)) {
      errors.push(
        `${path.relative(repositoryRoot, markdownPath)} references missing doctest ${relativeExample}`
      );
      continue;
    }
    const expected = normalizeSnippet(fs.readFileSync(examplePath, 'utf8'));
    const actual = normalizeSnippet(match[2] ?? '');
    if (actual !== expected) {
      errors.push(
        `${path.relative(repositoryRoot, markdownPath)} doctest differs from packages/native-epub-kit/docs/${relativeExample}`
      );
    }
  }
}

function normalizeSnippet(value) {
  return value.replace(/\r\n/g, '\n').trim();
}
