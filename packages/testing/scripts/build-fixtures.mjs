import { strToU8, zipSync } from 'fflate';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureDefinitions } from './fixture-definitions.mjs';

const testingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = join(testingRoot, 'fixtures');
const fixedZipDate = new Date(1980, 0, 1, 0, 0, 0);
const modifiedTimestamp = '2026-01-01T00:00:00Z';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function indentText(value) {
  return value
    .split('\n')
    .map((line) => escapeXml(line))
    .join('\n');
}

function xhtmlDocument({ body, direction, language, stylesheetHref, title, viewport }) {
  const viewportMeta = viewport
    ? `\n    <meta name="viewport" content="${escapeXml(viewport)}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}" dir="${escapeXml(direction)}">
  <head>
    <meta charset="utf-8"/>${viewportMeta}
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="${escapeXml(stylesheetHref)}"/>
  </head>
  <body>
    ${body}
  </body>
</html>
`;
}

function renderTocItems(nodes, depth = 2) {
  const indentation = '  '.repeat(depth);
  return nodes
    .map((node) => {
      const children = node.children?.length
        ? `\n${indentation}  <ol>\n${renderTocItems(node.children, depth + 2)}\n${indentation}  </ol>`
        : '';
      return `${indentation}<li><a href="${escapeXml(node.href)}">${escapeXml(node.label)}</a>${children}</li>`;
    })
    .join('\n');
}

function navDocument(definition) {
  const toc =
    definition.toc ??
    definition.documents
      .filter((document) => document.linear !== false)
      .map((document) => ({ label: document.title, href: document.href }));

  const body = `<nav epub:type="toc" id="toc" aria-labelledby="toc-title">
      <h1 id="toc-title">Contents</h1>
      <ol>
${renderTocItems(toc, 4)}
      </ol>
    </nav>`;

  return xhtmlDocument({
    body,
    direction: definition.direction,
    language: definition.language,
    stylesheetHref: 'styles/book.css',
    title: `${definition.title} — Contents`,
  });
}

function packageDocument(definition) {
  const documentItems = definition.documents
    .map(
      (document) =>
        `    <item id="${escapeXml(document.id)}" href="${escapeXml(document.href)}" media-type="application/xhtml+xml"/>`
    )
    .join('\n');
  const resourceItems = (definition.resources ?? [])
    .map((resource) => {
      const properties = resource.properties
        ? ` properties="${escapeXml(resource.properties)}"`
        : '';
      return `    <item id="${escapeXml(resource.id)}" href="${escapeXml(resource.href)}" media-type="${escapeXml(resource.mediaType)}"${properties}/>`;
    })
    .join('\n');
  const spine = definition.documents
    .map((document) => {
      const linear = document.linear === false ? ' linear="no"' : '';
      return `    <itemref idref="${escapeXml(document.id)}"${linear}/>`;
    })
    .join('\n');
  const pageProgression = definition.pageProgressionDirection
    ? ` page-progression-direction="${escapeXml(definition.pageProgressionDirection)}"`
    : '';
  const renditionLayout = definition.renditionLayout
    ? `\n    <meta property="rendition:layout">${escapeXml(definition.renditionLayout)}</meta>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0" xml:lang="${escapeXml(definition.language)}" dir="${escapeXml(definition.direction)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(definition.identifier)}</dc:identifier>
    <dc:title>${escapeXml(definition.title)}</dc:title>
    <dc:language>${escapeXml(definition.language)}</dc:language>
    <meta property="dcterms:modified">${modifiedTimestamp}</meta>${renditionLayout}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/book.css" media-type="text/css"/>
${documentItems}${resourceItems ? `\n${resourceItems}` : ''}
  </manifest>
  <spine${pageProgression}>
${spine}
  </spine>
</package>
`;
}

function stylesheet(definition) {
  return `@charset "UTF-8";

:root {
  color: #14213d;
  background: #fffaf0;
}

body {
  margin: 5%;
  font-family: serif;
  font-size: 1em;
  line-height: 1.6;
}

img {
  display: block;
  max-width: 100%;
  height: auto;
}

aside[epub|type~='footnote'] {
  border-inline-start: 0.25em solid #c9a227;
  margin-block: 1.5em;
  padding-inline-start: 1em;
}

pre {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
${definition.extraCss ?? ''}`;
}

const containerDocument = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function downloadAsset(asset, cacheDirectory) {
  const target = join(cacheDirectory, asset.fileName);

  try {
    const existing = await readFile(target);
    if (sha256(existing) === asset.sha256) {
      return existing;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not download ${asset.id}: HTTP ${response.status}`);
  }

  const value = Buffer.from(await response.arrayBuffer());
  const actualHash = sha256(value);
  if (actualHash !== asset.sha256) {
    throw new Error(
      `Checksum mismatch for ${asset.id}: expected ${asset.sha256}, got ${actualHash}`
    );
  }

  await mkdir(cacheDirectory, { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, value);
  await rename(temporary, target);
  return value;
}

async function loadAssets() {
  const manifest = await loadJson(join(fixturesRoot, 'assets.json'));
  const cacheDirectory = join(testingRoot, '.cache', 'fixture-assets');
  const entries = await Promise.all(
    manifest.assets.map(async (asset) => [asset.id, await downloadAsset(asset, cacheDirectory)])
  );
  return new Map(entries);
}

function createEpub(definition, assets) {
  const entries = new Map([
    ['mimetype', strToU8('application/epub+zip')],
    ['META-INF/container.xml', strToU8(containerDocument)],
    ['EPUB/package.opf', strToU8(packageDocument(definition))],
    ['EPUB/nav.xhtml', strToU8(navDocument(definition))],
    ['EPUB/styles/book.css', strToU8(stylesheet(definition))],
  ]);

  for (const document of definition.documents) {
    if (document.omitFromArchive === true) continue;
    const language = document.language ?? definition.language;
    const direction = document.direction ?? definition.direction;
    let body = document.body;

    if (document.bodyFromAsset) {
      const asset = assets.get(document.bodyFromAsset);
      if (!asset) {
        throw new Error(`Missing body asset ${document.bodyFromAsset}`);
      }
      body = `<h1>${escapeXml(document.title)}</h1><pre>${indentText(asset.toString('utf8'))}</pre>`;
    }

    entries.set(
      `EPUB/${document.href}`,
      strToU8(
        xhtmlDocument({
          body,
          direction,
          language,
          stylesheetHref: '../styles/book.css',
          title: document.title,
          viewport:
            definition.renditionLayout === 'pre-paginated' ? 'width=1200,height=1600' : undefined,
        })
      )
    );
  }

  for (const resource of definition.resources ?? []) {
    const value = resource.assetId ? assets.get(resource.assetId) : strToU8(resource.contents);
    if (!value) {
      throw new Error(`Missing resource value for ${resource.id}`);
    }
    entries.set(`EPUB/${resource.href}`, value);
  }

  const zippable = {};
  zippable.mimetype = [entries.get('mimetype'), { level: 0, mtime: fixedZipDate }];
  for (const path of [...entries.keys()].filter((path) => path !== 'mimetype').sort()) {
    zippable[path] = [entries.get(path), { level: 9, mtime: fixedZipDate }];
  }
  return zipSync(zippable, { level: 9, mtime: fixedZipDate });
}

function parseArguments(arguments_) {
  const outIndex = arguments_.indexOf('--out');
  if (outIndex === -1) {
    return join(fixturesRoot, 'generated');
  }
  const value = arguments_[outIndex + 1];
  if (!value) {
    throw new Error('--out requires a directory path.');
  }
  return resolve(value);
}

export async function buildFixtures(outputDirectory) {
  const fixtureSpecs = await loadJson(join(fixturesRoot, 'fixture-specs.json'));
  const specsById = new Map(fixtureSpecs.fixtures.map((fixture) => [fixture.id, fixture]));
  const definitionIds = fixtureDefinitions.map((definition) => definition.id).sort();
  const specificationIds = [...specsById.keys()].sort();

  if (JSON.stringify(definitionIds) !== JSON.stringify(specificationIds)) {
    throw new Error(
      'fixture-specs.json and fixture-definitions.mjs contain different fixture IDs.'
    );
  }

  const assets = await loadAssets();
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });

  const outputs = [];
  for (const definition of fixtureDefinitions) {
    const specification = specsById.get(definition.id);
    const value = createEpub(definition, assets);
    const path = join(outputDirectory, specification.file);
    await writeFile(path, value);
    outputs.push({
      ...specification,
      bytes: value.byteLength,
      sha256: sha256(value),
    });
  }

  const manifest = {
    schemaVersion: 1,
    generator: 'packages/testing/scripts/build-fixtures.mjs',
    fixtures: outputs,
  };
  await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDirectory = parseArguments(process.argv.slice(2));
  const manifest = await buildFixtures(outputDirectory);
  console.log(
    `Built ${manifest.fixtures.length} deterministic EPUB fixtures in ${outputDirectory}.`
  );
  for (const fixture of manifest.fixtures) {
    console.log(`${basename(fixture.file)}  ${fixture.sha256}`);
  }
}
