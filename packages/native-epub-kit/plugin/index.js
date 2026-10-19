'use strict';

const {
  createRunOncePlugin,
  IOSConfig,
  withAppBuildGradle,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');

const nativeDependencies = require('../native-dependencies.json');
const packageMetadata = require('../package.json');

const DESUGAR_DEPENDENCY = nativeDependencies.android.coreLibraryDesugaring;
// Mirrors s.platforms in ios/NativeEpubKit.podspec.
const IOS_MINIMUM_DEPLOYMENT_TARGET = '16.4';
const READIUM_PODS = ['ReadiumInternal', 'ReadiumShared', 'ReadiumStreamer', 'ReadiumNavigator'];
const POD_BLOCK_BEGIN = '  # @generated begin native-epub-kit Readium pods';
const POD_BLOCK_END = '  # @generated end native-epub-kit Readium pods';
const XCODE_PATCH_BLOCK_BEGIN = '# @generated begin native-epub-kit Xcode compatibility';
const XCODE_PATCH_BLOCK_END = '# @generated end native-epub-kit Xcode compatibility';
const DEPLOYMENT_FLOOR_BLOCK_BEGIN =
  '    # @generated begin native-epub-kit deployment target floor';
const DEPLOYMENT_FLOOR_BLOCK_END = '    # @generated end native-epub-kit deployment target floor';
const FONT_MANIFEST_FILE = 'NativeEpubKitFonts.json';
const FONT_SCHEMA_VERSION = 1;
const IOS_FONT_DIRECTORY = 'NativeEpubKitFonts';
const ANDROID_FONT_DIRECTORY = 'app/src/main/assets/native_epub_kit/fonts';
const ANDROID_FONT_MANIFEST = 'app/src/main/assets/native_epub_kit/fonts.json';
const GENERATED_FONT_PREFIX = 'NativeEpubKit-';
const MAXIMUM_FONT_FACES = 64;
const MAXIMUM_FONT_FILE_BYTES = 32 * 1024 * 1024;
const PLUGIN_OPTION_KEYS = new Set(['fonts']);
const FONT_DEFINITION_KEYS = new Set(['family', 'source', 'style', 'weight']);

function normalizePluginOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('native-epub-kit plugin options must be an object.');
  }
  const unknown = Object.keys(options).find((key) => !PLUGIN_OPTION_KEYS.has(key));
  if (unknown) {
    throw new TypeError(`native-epub-kit has an unknown plugin option ${JSON.stringify(unknown)}.`);
  }
  return { fonts: normalizeFontDefinitions(options.fonts) };
}

function normalizeFontDefinitions(fonts = []) {
  if (!Array.isArray(fonts)) {
    throw new TypeError('native-epub-kit fonts must be an array.');
  }
  if (fonts.length > MAXIMUM_FONT_FACES) {
    throw new TypeError(
      `native-epub-kit supports at most ${MAXIMUM_FONT_FACES} configured font faces.`
    );
  }

  const faces = new Set();
  return fonts.map((font, index) => {
    if (!font || typeof font !== 'object' || Array.isArray(font)) {
      throw new TypeError(`native-epub-kit font at index ${index} must be an object.`);
    }

    const unknown = Object.keys(font).find((key) => !FONT_DEFINITION_KEYS.has(key));
    if (unknown) {
      throw new TypeError(
        `native-epub-kit font at index ${index} has an unknown field ${JSON.stringify(unknown)}.`
      );
    }

    const family = typeof font.family === 'string' ? font.family.trim().normalize('NFC') : '';
    const source = typeof font.source === 'string' ? font.source.trim() : '';
    const style = font.style ?? 'normal';
    const weight = font.weight ?? 400;
    if (!family) {
      throw new TypeError(`native-epub-kit font at index ${index} requires a family.`);
    }
    if (family.length > 128 || /[\u0000-\u001f\u007f]/u.test(family)) {
      throw new TypeError(`native-epub-kit font at index ${index} has an invalid family name.`);
    }
    if (!source) {
      throw new TypeError(`native-epub-kit font ${JSON.stringify(family)} requires a source.`);
    }
    if (source.includes('\0') || path.isAbsolute(source)) {
      throw new TypeError(
        `native-epub-kit font ${JSON.stringify(family)} source must be a project-relative path.`
      );
    }
    if (!['normal', 'italic'].includes(style)) {
      throw new TypeError(
        `native-epub-kit font ${JSON.stringify(family)} has unsupported style ${JSON.stringify(style)}.`
      );
    }
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      throw new TypeError(
        `native-epub-kit font ${JSON.stringify(family)} requires an integer weight from 1 to 1000.`
      );
    }

    const faceKey = `${family}\0${weight}\0${style}`;
    if (faces.has(faceKey)) {
      throw new TypeError(
        `native-epub-kit font face ${JSON.stringify(family)} ${weight} ${style} is duplicated.`
      );
    }
    faces.add(faceKey);

    const extension = path.extname(source).toLowerCase();
    if (!['.otf', '.ttf'].includes(extension)) {
      throw new TypeError(
        `native-epub-kit font ${JSON.stringify(family)} must use an .otf or .ttf source.`
      );
    }
    const sourceStem =
      path.basename(source, extension).replaceAll(/[^a-zA-Z0-9_-]/g, '-') || 'font';
    const file = `NativeEpubKit-${index}-${sourceStem}${extension}`;
    return { family, file, source, style, weight };
  });
}

function resolveFontDefinitions(fonts, projectRoot) {
  const canonicalProjectRoot = fs.realpathSync(projectRoot);
  return fonts.map((font) => {
    const absoluteSource = path.resolve(projectRoot, font.source);
    const relativeSource = path.relative(projectRoot, absoluteSource);
    if (
      relativeSource === '..' ||
      relativeSource.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeSource)
    ) {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source escapes the project root: ${font.source}`
      );
    }
    if (!fs.existsSync(absoluteSource) || !fs.statSync(absoluteSource).isFile()) {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source does not exist or is not a file: ${font.source}`
      );
    }
    const canonicalSource = fs.realpathSync(absoluteSource);
    const canonicalRelative = path.relative(canonicalProjectRoot, canonicalSource);
    if (
      canonicalRelative === '..' ||
      canonicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelative)
    ) {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source resolves outside the project root: ${font.source}`
      );
    }
    try {
      fs.accessSync(canonicalSource, fs.constants.R_OK);
    } catch {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source is not readable: ${font.source}`
      );
    }
    const size = fs.statSync(canonicalSource).size;
    if (size < 12 || size > MAXIMUM_FONT_FILE_BYTES) {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source must be 12 bytes to ${MAXIMUM_FONT_FILE_BYTES} bytes: ${font.source}`
      );
    }
    const descriptor = fs.openSync(canonicalSource, 'r');
    const signature = Buffer.alloc(4);
    try {
      fs.readSync(descriptor, signature, 0, signature.length, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    const signatureHex = signature.toString('hex');
    const signatureText = signature.toString('ascii');
    if (signatureHex !== '00010000' && signatureText !== 'OTTO') {
      throw new Error(
        `native-epub-kit font ${JSON.stringify(font.family)} source is not a supported TrueType/OpenType file: ${font.source}`
      );
    }
    return { ...font, absoluteSource: canonicalSource };
  });
}

function buildFontManifest(fonts, platform) {
  return {
    schemaVersion: FONT_SCHEMA_VERSION,
    fonts: fonts.map(({ family, file, style, weight }) => ({
      family,
      file,
      path: platform === 'android' ? `native_epub_kit/fonts/${file}` : file,
      style,
      weight,
    })),
  };
}

function writeFileIfChanged(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents) return false;
  const temporary = `${file}.native-epub-kit-tmp`;
  fs.writeFileSync(temporary, contents, 'utf8');
  fs.renameSync(temporary, file);
  return true;
}

function writeJson(file, value) {
  return writeFileIfChanged(file, `${JSON.stringify(value, null, 2)}\n`);
}

function filesAreEqual(left, right) {
  if (!fs.existsSync(right)) return false;
  const leftStat = fs.statSync(left);
  const rightStat = fs.statSync(right);
  return leftStat.size === rightStat.size && fs.readFileSync(left).equals(fs.readFileSync(right));
}

function copyFonts(fonts, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const expected = new Set(fonts.map((font) => font.file));
  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (!expected.has(entry.name)) {
      fs.rmSync(path.join(destination, entry.name), { force: true, recursive: true });
    }
  }
  for (const font of fonts) {
    const output = path.join(destination, font.file);
    if (!filesAreEqual(font.absoluteSource, output)) {
      fs.copyFileSync(font.absoluteSource, output);
    }
  }
}

function synchronizeFontAssets(fonts, destination, manifestFile, platform) {
  if (fonts.length === 0) {
    fs.rmSync(destination, { force: true, recursive: true });
    if (!manifestFile.startsWith(`${destination}${path.sep}`)) {
      fs.rmSync(manifestFile, { force: true });
    }
    return;
  }
  copyFonts(fonts, destination);
  writeJson(manifestFile, buildFontManifest(fonts, platform));
}

function unquoteXcodePath(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : '';
}

function iosFontResourcePaths(project) {
  const fileReferences = project.pbxFileReferenceSection();
  return new Set(
    Object.entries(fileReferences)
      .filter(([key, value]) => !key.endsWith('_comment') && value && typeof value === 'object')
      .map(([, value]) => unquoteXcodePath(value.path))
      .filter((value) => value.startsWith(`${IOS_FONT_DIRECTORY}/`))
  );
}

function reconcileIosFontResources(project, currentFiles) {
  const currentPaths = new Set(
    currentFiles.map((file) => path.posix.join(IOS_FONT_DIRECTORY, file))
  );
  const existingPaths = iosFontResourcePaths(project);
  const groupKey = project.findPBXGroupKey({ name: 'Resources' });
  for (const existing of existingPaths) {
    if (!currentPaths.has(existing)) {
      project.removeResourceFile(existing, undefined, groupKey);
    }
  }
  return project;
}

function reconcileIosInfoPlistFonts(existing, currentFiles) {
  const retained = (Array.isArray(existing) ? existing : []).filter(
    (file) => typeof file === 'string' && !path.basename(file).startsWith(GENERATED_FONT_PREFIX)
  );
  return Array.from(new Set([...retained, ...currentFiles]));
}

function escapeRubySingleQuoted(value) {
  return value.replaceAll('\\', '/').replaceAll("'", "\\\\'");
}

function ensurePodSources(contents) {
  const sources = [
    "source 'https://github.com/readium/podspecs'",
    "source 'https://cdn.cocoapods.org/'",
  ];
  const missing = sources.filter((source) => !contents.includes(source));
  return missing.length === 0 ? contents : `${missing.join('\n')}\n\n${contents}`;
}

function addReadiumPods(contents, { iosProjectRoot, packageRoot }) {
  const relativeSpecsDirectory = escapeRubySingleQuoted(
    path.relative(iosProjectRoot, path.join(packageRoot, 'ios', 'readium-podspecs'))
  );
  const podLines = [
    "  pod 'Minizip', :modular_headers => true",
    ...READIUM_PODS.map(
      (pod) =>
        `  pod '${pod}', :podspec => '${path.posix.join(relativeSpecsDirectory, `${pod}.podspec`)}'`
    ),
  ];
  const block = [POD_BLOCK_BEGIN, ...podLines, POD_BLOCK_END].join('\n');
  const existingBlock = new RegExp(
    `${POD_BLOCK_BEGIN.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${POD_BLOCK_END.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g'
  );
  let next = ensurePodSources(contents).replace(existingBlock, '');
  const anchor = '  use_expo_modules!';
  if (!next.includes(anchor)) {
    throw new Error('native-epub-kit could not find use_expo_modules! in the generated Podfile.');
  }
  next = next.replace(anchor, `${anchor}\n${block}`);
  return next;
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generatedBlockPattern(separator, begin, end) {
  return new RegExp(`${separator}${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`, 'g');
}

/**
 * Keeps Expo SDK 56 projects building with Xcode 27.1. Readium's resource pods
 * and CryptoSwift declare iOS 11/13 targets that Xcode 27.1 rejects, and
 * ExpoModulesJSI passes a Swift closure through a conditional expression that
 * the Xcode 27.1 compiler no longer converts to a C function pointer.
 */
function addXcodeCompatibility(contents, { minimumIos }) {
  const jsiPatch = [
    XCODE_PATCH_BLOCK_BEGIN,
    '# Converts the setter before the conditional so Xcode 27.1 accepts it. The',
    '# patch is skipped once ExpoModulesJSI ships the fix and fails closed if the',
    '# surrounding source changes.',
    'native_epub_kit_jsi_package = begin',
    `  \`node --print "require.resolve('expo-modules-jsi/package.json', { paths: [require.resolve('expo/package.json')] })"\`.strip`,
    'rescue StandardError',
    "  ''",
    'end',
    'unless native_epub_kit_jsi_package.empty?',
    "  native_epub_kit_jsi_runtime = File.join(File.dirname(native_epub_kit_jsi_package), 'apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift')",
    '  if File.exist?(native_epub_kit_jsi_runtime)',
    '    native_epub_kit_jsi_source = File.read(native_epub_kit_jsi_runtime)',
    '    native_epub_kit_jsi_original = "    let callbacks = expo.HostObjectCallbacks(\\n      context, getter, set == nil ? nil : setter, propertyNamesGetter, deallocate)"',
    '    native_epub_kit_jsi_patched = "    let setterCallback: (@convention(c) (UnsafeMutableRawPointer, UnsafePointer<CChar>, UnsafeMutableRawPointer) -> Void) = setter\\n    let callbacks = expo.HostObjectCallbacks(\\n      context, getter, set == nil ? nil : setterCallback, propertyNamesGetter, deallocate)"',
    "    if native_epub_kit_jsi_source.include?('set == nil ? nil : setter,') && !native_epub_kit_jsi_source.include?(native_epub_kit_jsi_patched)",
    "      raise 'native-epub-kit: ExpoModulesJSI changed; review the Xcode 27.1 setter patch.' unless native_epub_kit_jsi_source.include?(native_epub_kit_jsi_original)",
    '      File.write(native_epub_kit_jsi_runtime, native_epub_kit_jsi_source.sub(native_epub_kit_jsi_original, native_epub_kit_jsi_patched))',
    '    end',
    '  end',
    'end',
    XCODE_PATCH_BLOCK_END,
  ].join('\n');
  const floor = [
    DEPLOYMENT_FLOOR_BLOCK_BEGIN,
    '    # Raise pods below the app minimum; Xcode 27.1 rejects targets under iOS 15.',
    `    native_epub_kit_minimum_ios = podfile_properties['ios.deploymentTarget'] || '${minimumIos}'`,
    '    installer.pods_project.targets.each do |native_epub_kit_target|',
    '      native_epub_kit_target.build_configurations.each do |native_epub_kit_build|',
    "        native_epub_kit_current = native_epub_kit_build.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
    '        next unless native_epub_kit_current',
    '        next unless Gem::Version.new(native_epub_kit_current) < Gem::Version.new(native_epub_kit_minimum_ios)',
    "        native_epub_kit_build.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = native_epub_kit_minimum_ios",
    '      end',
    '    end',
    DEPLOYMENT_FLOOR_BLOCK_END,
  ].join('\n');

  let next = contents
    .replace(generatedBlockPattern('\\n\\n', XCODE_PATCH_BLOCK_BEGIN, XCODE_PATCH_BLOCK_END), '')
    .replace(
      generatedBlockPattern('\\n', DEPLOYMENT_FLOOR_BLOCK_BEGIN, DEPLOYMENT_FLOOR_BLOCK_END),
      ''
    );
  const propertiesAnchor = /^podfile_properties = .*$/m;
  if (!propertiesAnchor.test(next)) {
    throw new Error('native-epub-kit could not find podfile_properties in the generated Podfile.');
  }
  next = next.replace(propertiesAnchor, (line) => `${line}\n\n${jsiPatch}`);
  const postInstall = /^  post_install do \|installer\|$/m;
  if (!postInstall.test(next)) {
    throw new Error('native-epub-kit could not find post_install in the generated Podfile.');
  }
  return next.replace(postInstall, (line) => `${line}\n${floor}`);
}

function addCoreLibraryDesugaring(contents) {
  let next = contents;
  if (!next.includes('coreLibraryDesugaringEnabled true')) {
    const androidBlock = /android\s*\{/;
    if (!androidBlock.test(next)) {
      throw new Error('native-epub-kit could not find the Android block in app/build.gradle.');
    }
    next = next.replace(
      androidBlock,
      `android {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }`
    );
  }

  const dependency = `coreLibraryDesugaring("${DESUGAR_DEPENDENCY}")`;
  if (!next.includes(dependency)) {
    const dependenciesBlock = /dependencies\s*\{/;
    if (!dependenciesBlock.test(next)) {
      throw new Error('native-epub-kit could not find the dependencies block in app/build.gradle.');
    }
    next = next.replace(dependenciesBlock, `dependencies {\n    ${dependency}`);
  }
  return next;
}

function withReadiumPods(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const iosProjectRoot = modConfig.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosProjectRoot, 'Podfile');
      const packageRoot = path.resolve(__dirname, '..');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      const withPods = addReadiumPods(contents, { iosProjectRoot, packageRoot });
      fs.writeFileSync(
        podfilePath,
        addXcodeCompatibility(withPods, { minimumIos: IOS_MINIMUM_DEPLOYMENT_TARGET }),
        'utf8'
      );
      return modConfig;
    },
  ]);
}

function withReadiumDesugaring(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('native-epub-kit currently requires a Groovy Android app build.gradle.');
    }
    modConfig.modResults.contents = addCoreLibraryDesugaring(modConfig.modResults.contents);
    return modConfig;
  });
}

function withNativeEpubKitFonts(config, fonts) {
  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const platformRoot = modConfig.modRequest.platformProjectRoot;
      const resolvedFonts = resolveFontDefinitions(fonts, projectRoot);
      synchronizeFontAssets(
        resolvedFonts,
        path.join(platformRoot, ANDROID_FONT_DIRECTORY),
        path.join(platformRoot, ANDROID_FONT_MANIFEST),
        'android'
      );
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const platformRoot = modConfig.modRequest.platformProjectRoot;
    const resolvedFonts = resolveFontDefinitions(fonts, projectRoot);
    const destination = path.join(platformRoot, IOS_FONT_DIRECTORY);
    synchronizeFontAssets(
      resolvedFonts,
      destination,
      path.join(destination, FONT_MANIFEST_FILE),
      'ios'
    );

    const project = modConfig.modResults;
    const currentFiles =
      resolvedFonts.length === 0
        ? []
        : [...resolvedFonts.map((font) => font.file), FONT_MANIFEST_FILE];
    reconcileIosFontResources(project, currentFiles);
    if (currentFiles.length > 0) {
      IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
      const existingPaths = iosFontResourcePaths(project);
      for (const file of currentFiles) {
        const filepath = path.posix.join(IOS_FONT_DIRECTORY, file);
        if (existingPaths.has(filepath)) continue;
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath,
          groupName: 'Resources',
          isBuildFile: true,
          project,
          verbose: true,
        });
      }
    }
    return modConfig;
  });

  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIAppFonts = reconcileIosInfoPlistFonts(
      modConfig.modResults.UIAppFonts,
      fonts.map((font) => font.file)
    );
    return modConfig;
  });
}

function withNativeEpubKit(config, options = {}) {
  const { fonts } = normalizePluginOptions(options);
  config = withReadiumPods(config);
  config = withReadiumDesugaring(config);
  return withNativeEpubKitFonts(config, fonts);
}

module.exports = createRunOncePlugin(
  withNativeEpubKit,
  packageMetadata.name,
  packageMetadata.version
);
module.exports.addCoreLibraryDesugaring = addCoreLibraryDesugaring;
module.exports.addReadiumPods = addReadiumPods;
module.exports.addXcodeCompatibility = addXcodeCompatibility;
module.exports.buildFontManifest = buildFontManifest;
module.exports.MAXIMUM_FONT_FACES = MAXIMUM_FONT_FACES;
module.exports.iosFontResourcePaths = iosFontResourcePaths;
module.exports.normalizeFontDefinitions = normalizeFontDefinitions;
module.exports.normalizePluginOptions = normalizePluginOptions;
module.exports.reconcileIosFontResources = reconcileIosFontResources;
module.exports.reconcileIosInfoPlistFonts = reconcileIosInfoPlistFonts;
module.exports.resolveFontDefinitions = resolveFontDefinitions;
module.exports.synchronizeFontAssets = synchronizeFontAssets;
module.exports.withNativeEpubKit = withNativeEpubKit;
