import { Buffer } from 'node:buffer';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  addCoreLibraryDesugaring,
  addReadiumPods,
  addXcodeCompatibility,
  buildFontManifest,
  MAXIMUM_FONT_FACES,
  normalizeFontDefinitions,
  normalizePluginOptions,
  reconcileIosFontResources,
  reconcileIosInfoPlistFonts,
  resolveFontDefinitions,
  synchronizeFontAssets,
  withNativeEpubKit,
} = require('..');

function writeTestFont(file, signature = Buffer.from([0x00, 0x01, 0x00, 0x00])) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([signature, Buffer.alloc(20, 0x42)]));
}

describe('native-epub-kit config plugin transforms', () => {
  it('adds exact local Readium podspecs and sources idempotently', () => {
    const initial = `require 'expo/scripts/autolinking'

target 'Example' do
  use_expo_modules!
end
`;
    const options = {
      iosProjectRoot: '/workspace/app/ios',
      packageRoot: '/workspace/app/node_modules/native-epub-kit',
    };

    const once = addReadiumPods(initial, options);
    const twice = addReadiumPods(once, options);

    expect(twice).toBe(once);
    expect(once.match(/source 'https:\/\/github.com\/readium\/podspecs'/g)).toHaveLength(1);
    expect(once.match(/source 'https:\/\/cdn.cocoapods.org\/'/g)).toHaveLength(1);
    expect(once.match(/pod 'Minizip', :modular_headers => true/g)).toHaveLength(1);
    for (const pod of ['ReadiumInternal', 'ReadiumShared', 'ReadiumStreamer', 'ReadiumNavigator']) {
      expect(once.match(new RegExp(`pod '${pod}'`, 'g'))).toHaveLength(1);
    }
    expect(once).toContain(
      path.posix.join('..', 'node_modules', 'native-epub-kit', 'ios', 'readium-podspecs')
    );
    expect(once).not.toContain('File.join(__dir__');
    expect(once).not.toContain('/workspace/app/node_modules');
  });

  it('adds Xcode 27.1 compatibility to the Podfile idempotently', () => {
    const initial = `podfile_properties = JSON.parse(File.read(File.join(__dir__, 'Podfile.properties.json'))) rescue {}

target 'Example' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(installer)
  end
end
`;
    const once = addXcodeCompatibility(initial, { minimumIos: '16.4' });
    const twice = addXcodeCompatibility(once, { minimumIos: '16.4' });

    expect(twice).toBe(once);
    expect(once.match(/@generated begin native-epub-kit Xcode compatibility/g)).toHaveLength(1);
    expect(once.match(/@generated begin native-epub-kit deployment target floor/g)).toHaveLength(1);
    expect(once).toContain("podfile_properties['ios.deploymentTarget'] || '16.4'");
    expect(once.indexOf('Xcode compatibility')).toBeGreaterThan(
      once.indexOf('podfile_properties =')
    );
    expect(once.indexOf('deployment target floor')).toBeGreaterThan(
      once.indexOf('post_install do |installer|')
    );
    expect(once.indexOf('deployment target floor')).toBeLessThan(
      once.indexOf('react_native_post_install')
    );
  });

  it('fails clearly when the Podfile lacks Expo template anchors', () => {
    expect(() =>
      addXcodeCompatibility("target 'Example' do\nend\n", { minimumIos: '16.4' })
    ).toThrow(/podfile_properties/);
    expect(() =>
      addXcodeCompatibility('podfile_properties = {}\n', { minimumIos: '16.4' })
    ).toThrow(/post_install/);
  });

  it('enables Android core-library desugaring idempotently', () => {
    const initial = `android {
    namespace 'com.example'
}

dependencies {
    implementation('com.facebook.react:react-android')
}
`;
    const once = addCoreLibraryDesugaring(initial);
    const twice = addCoreLibraryDesugaring(once);

    expect(twice).toBe(once);
    expect(once.match(/coreLibraryDesugaringEnabled true/g)).toHaveLength(1);
    expect(
      once.match(/coreLibraryDesugaring\("com.android.tools:desugar_jdk_libs:2.1.5"\)/g)
    ).toHaveLength(1);
  });

  it('normalizes a constrained font manifest for both native asset systems', () => {
    const fonts = normalizeFontDefinitions([
      {
        family: 'Lateef Qualification',
        source: './assets/fonts/Lateef 400.ttf',
      },
    ]);

    expect(fonts).toEqual([
      {
        family: 'Lateef Qualification',
        file: 'NativeEpubKit-0-Lateef-400.ttf',
        source: './assets/fonts/Lateef 400.ttf',
        style: 'normal',
        weight: 400,
      },
    ]);
    expect(buildFontManifest(fonts, 'ios').fonts[0]).toMatchObject({
      family: 'Lateef Qualification',
      path: 'NativeEpubKit-0-Lateef-400.ttf',
    });
    expect(buildFontManifest(fonts, 'android').fonts[0]).toMatchObject({
      family: 'Lateef Qualification',
      path: 'native_epub_kit/fonts/NativeEpubKit-0-Lateef-400.ttf',
    });
  });

  it('rejects ambiguous or unsafe font declarations before prebuild', () => {
    expect(() => normalizeFontDefinitions('font.ttf')).toThrow(/must be an array/);
    expect(() => normalizeFontDefinitions([{ family: 'Lateef', source: 'font.woff2' }])).toThrow(
      /\.otf or \.ttf/
    );
    expect(() =>
      normalizeFontDefinitions([
        { family: 'Lateef', source: 'regular.ttf' },
        { family: 'Lateef', source: 'duplicate.ttf' },
      ])
    ).toThrow(/face.*duplicated/);
    expect(
      normalizeFontDefinitions([
        { family: 'Lateef', source: 'regular.ttf' },
        { family: 'Lateef', source: 'bold.ttf', weight: 700 },
        { family: 'Lateef', source: 'italic.ttf', style: 'italic' },
      ])
    ).toHaveLength(3);
    expect(() =>
      normalizeFontDefinitions([{ family: 'Lateef', source: 'font.ttf', weight: 1200 }])
    ).toThrow(/1 to 1000/);
    expect(() => normalizeFontDefinitions([{ family: 'Lateef', source: '/tmp/font.ttf' }])).toThrow(
      /project-relative/
    );
    expect(() =>
      normalizeFontDefinitions([{ family: 'Lateef', source: 'font.ttf', typo: true }])
    ).toThrow(/unknown field "typo"/);
    expect(() => normalizePluginOptions({ typo: true })).toThrow(/unknown plugin option "typo"/);
    expect(() => normalizeFontDefinitions(Array(MAXIMUM_FONT_FACES + 1).fill({}))).toThrow(
      /at most 64/
    );
  });

  it('resolves only readable project-contained TrueType/OpenType files', () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'native-epub-kit-font-resolution-'));
    const projectRoot = path.join(parent, 'project');
    mkdirSync(projectRoot);
    const valid = path.join(projectRoot, 'assets', 'valid.ttf');
    const otf = path.join(projectRoot, 'assets', 'valid.otf');
    const invalid = path.join(projectRoot, 'assets', 'invalid.ttf');
    const outside = path.join(parent, 'outside.ttf');
    writeTestFont(valid);
    writeTestFont(otf, Buffer.from('OTTO'));
    writeTestFont(invalid, Buffer.from('NOPE'));
    writeTestFont(outside);
    symlinkSync(outside, path.join(projectRoot, 'assets', 'linked.ttf'));

    const resolved = resolveFontDefinitions(
      normalizeFontDefinitions([
        { family: 'TrueType', source: './assets/valid.ttf' },
        { family: 'OpenType', source: './assets/valid.otf' },
      ]),
      projectRoot
    );
    expect(resolved.map((font) => path.basename(font.absoluteSource))).toEqual([
      'valid.ttf',
      'valid.otf',
    ]);
    expect(() =>
      resolveFontDefinitions(
        normalizeFontDefinitions([{ family: 'Missing', source: './assets/missing.ttf' }]),
        projectRoot
      )
    ).toThrow(/does not exist or is not a file/);
    expect(() =>
      resolveFontDefinitions(
        normalizeFontDefinitions([{ family: 'Invalid', source: './assets/invalid.ttf' }]),
        projectRoot
      )
    ).toThrow(/not a supported TrueType\/OpenType/);
    expect(() =>
      resolveFontDefinitions(
        normalizeFontDefinitions([{ family: 'Escape', source: '../outside.ttf' }]),
        projectRoot
      )
    ).toThrow(/escapes the project root/);
    expect(() =>
      resolveFontDefinitions(
        normalizeFontDefinitions([{ family: 'Link', source: './assets/linked.ttf' }]),
        projectRoot
      )
    ).toThrow(/resolves outside the project root/);
  });

  it('synchronizes package-owned assets and manifests without repeated writes', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'native-epub-kit-font-sync-'));
    const source = path.join(projectRoot, 'assets', 'Lateef.ttf');
    writeTestFont(source);
    const fonts = resolveFontDefinitions(
      normalizeFontDefinitions([{ family: 'Lateef', source: './assets/Lateef.ttf' }]),
      projectRoot
    );
    const destination = path.join(projectRoot, 'android', 'fonts');
    const manifest = path.join(projectRoot, 'android', 'fonts.json');
    mkdirSync(destination, { recursive: true });
    writeFileSync(path.join(destination, 'NativeEpubKit-stale.ttf'), 'stale');

    synchronizeFontAssets(fonts, destination, manifest, 'android');
    const output = path.join(destination, fonts[0].file);
    const firstTimes = [statSync(output).mtimeMs, statSync(manifest).mtimeMs];
    synchronizeFontAssets(fonts, destination, manifest, 'android');
    expect([statSync(output).mtimeMs, statSync(manifest).mtimeMs]).toEqual(firstTimes);
    expect(readFileSync(output)).toEqual(readFileSync(source));
    expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual(buildFontManifest(fonts, 'android'));
    expect(() => statSync(path.join(destination, 'NativeEpubKit-stale.ttf'))).toThrow();
  });

  it('reconciles stale iOS resources and reserved Info.plist entries', () => {
    const removeResourceFile = vi.fn();
    const project = {
      findPBXGroupKey: vi.fn(() => 'RESOURCES_GROUP'),
      pbxFileReferenceSection: vi.fn(() => ({
        CURRENT: { path: 'NativeEpubKitFonts/NativeEpubKit-0-current.ttf' },
        MANIFEST: { path: 'NativeEpubKitFonts/NativeEpubKitFonts.json' },
        OTHER: { path: 'Other/consumer.png' },
        STALE: { path: 'NativeEpubKitFonts/NativeEpubKit-1-stale.ttf' },
      })),
      removeResourceFile,
    };
    reconcileIosFontResources(project, ['NativeEpubKit-0-current.ttf', 'NativeEpubKitFonts.json']);
    expect(removeResourceFile).toHaveBeenCalledTimes(1);
    expect(removeResourceFile).toHaveBeenCalledWith(
      'NativeEpubKitFonts/NativeEpubKit-1-stale.ttf',
      undefined,
      'RESOURCES_GROUP'
    );
    expect(
      reconcileIosInfoPlistFonts(
        ['Consumer.ttf', 'NativeEpubKit-old.ttf', 'Consumer.ttf'],
        ['NativeEpubKit-new.ttf']
      )
    ).toEqual(['Consumer.ttf', 'NativeEpubKit-new.ttf']);
  });

  it('registers Android and iOS production mods even for an empty font set', () => {
    const config = withNativeEpubKit(
      { name: 'Plugin Mod Fixture', slug: 'plugin-mod-fixture' },
      { fonts: [] }
    );
    expect(config.mods?.android).toMatchObject({
      appBuildGradle: expect.any(Function),
      dangerous: expect.any(Function),
    });
    expect(config.mods?.ios).toMatchObject({
      dangerous: expect.any(Function),
      infoPlist: expect.any(Function),
      xcodeproj: expect.any(Function),
    });
  });
});
