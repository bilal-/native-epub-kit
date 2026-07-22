import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot = join(testingRoot, '.cache', 'tools', 'epubcheck');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target, expectedHash) {
  if (await exists(target)) {
    const existing = await readFile(target);
    if (sha256(existing) === expectedHash) {
      return;
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download EPUBCheck: HTTP ${response.status}`);
  }
  const value = Buffer.from(await response.arrayBuffer());
  const actualHash = sha256(value);
  if (actualHash !== expectedHash) {
    throw new Error(
      `EPUBCheck archive checksum mismatch: expected ${expectedHash}, got ${actualHash}`
    );
  }

  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, value);
  await rename(temporary, target);
}

async function findFile(directory, fileName) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && entry.name === fileName);
  if (!match) {
    return undefined;
  }
  return join(match.parentPath, match.name);
}

export async function ensureEpubcheck() {
  const configuration = JSON.parse(
    await readFile(join(testingRoot, 'tools', 'epubcheck.json'), 'utf8')
  );
  const archive = join(cacheRoot, `epubcheck-${configuration.version}.zip`);
  const extractionDirectory = join(cacheRoot, configuration.version);

  await download(configuration.url, archive, configuration.sha256);

  let jar = (await exists(extractionDirectory))
    ? await findFile(extractionDirectory, 'epubcheck.jar')
    : undefined;
  if (!jar) {
    await rm(extractionDirectory, { force: true, recursive: true });
    await mkdir(extractionDirectory, { recursive: true });
    execFileSync('unzip', ['-q', archive, '-d', extractionDirectory], { stdio: 'inherit' });
    jar = await findFile(extractionDirectory, 'epubcheck.jar');
  }
  if (!jar) {
    throw new Error(
      `The EPUBCheck ${configuration.version} archive did not contain epubcheck.jar.`
    );
  }

  return { configuration, jar };
}

function collectMessages(value, messages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMessages(item, messages);
    }
    return messages;
  }
  if (!value || typeof value !== 'object') {
    return messages;
  }

  const id = value.ID ?? value.id;
  const severity = value.severity;
  if (typeof id === 'string' && typeof severity === 'string') {
    messages.push({ id, severity: severity.toUpperCase() });
  }
  for (const nested of Object.values(value)) {
    collectMessages(nested, messages);
  }
  return messages;
}

export function runEpubcheck({ epubPath, jar, reportDirectory }) {
  const reportPath = join(reportDirectory, `${basename(epubPath)}.json`);
  const result = spawnSync('java', ['-jar', jar, epubPath, '--json', reportPath], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }

  return readFile(reportPath, 'utf8').then((contents) => {
    const report = JSON.parse(contents);
    const messages = collectMessages(report);
    return {
      exitCode: result.status,
      messages,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  });
}
