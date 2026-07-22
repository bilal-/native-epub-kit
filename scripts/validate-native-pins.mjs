import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(repositoryRoot, 'packages', 'native-epub-kit');

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function read(relativePath) {
  return readFile(join(repositoryRoot, relativePath), 'utf8');
}

const pins = JSON.parse(await read('packages/native-epub-kit/native-dependencies.json'));
const swift = pins.readiumSwift;
const kotlin = pins.readiumKotlin;
const packageMetadata = JSON.parse(await read('packages/native-epub-kit/package.json'));

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

invariant(pins.schemaVersion === 1, 'Unsupported native-dependencies.json schema.');
invariant(/^\d+\.\d+\.\d+$/.test(kotlin.version), 'Readium Kotlin must use an exact release.');
invariant(/^[a-f0-9]{40}$/.test(kotlin.tagCommit), 'Readium Kotlin tag commit must be a full SHA.');
invariant(/^[a-f0-9]{40}$/.test(swift.revision), 'Readium Swift must use a full commit SHA.');
invariant(
  /^[a-f0-9]{40}$/.test(swift.releaseTagCommit),
  'Swift release tag must map to a full SHA.'
);
invariant(
  swift.integrationVersion.startsWith(`${swift.baseVersion}-`),
  'Swift integration version must retain its upstream release base.'
);
invariant(
  swift.revision !== swift.releaseTagCommit,
  'Readium Swift must not regress to the release tag that lacks font asset CORS.'
);
invariant(
  swift.upstreamFontFixPullRequest === 845,
  'Readium Swift font CORS qualification must remain anchored to upstream PR 845.'
);
invariant(
  /^[a-f0-9]{64}$/.test(swift.fontCorsQualification.releaseTagWebViewServerSha256) &&
    /^[a-f0-9]{64}$/.test(swift.fontCorsQualification.selectedWebViewServerSha256),
  'Readium Swift CORS source evidence must use full SHA-256 values.'
);

const gradle = await read('packages/native-epub-kit/android/build.gradle');
for (const module of kotlin.modules) {
  invariant(
    gradle.includes(`org.readium.kotlin-toolkit:${module}:\${readiumKotlinVersion}`),
    `Android Gradle is missing exact ${module} integration.`
  );
}
invariant(
  gradle.includes("new groovy.json.JsonSlurper().parse(file('../native-dependencies.json'))"),
  'Android Gradle must read the canonical native pin manifest.'
);
invariant(!gradle.includes(':+'), 'Android native dependencies must not float.');
invariant(
  gradle.includes('androidx.fragment:fragment-ktx:${fragmentKtxVersion}') &&
    gradle.includes('nativeDependencies.android.fragmentKtx'),
  'Android Fragment hosting must derive its exact Fragment KTX version from the pin manifest.'
);
invariant(
  gradle.includes('nativeDependencies.readiumKotlin.tagCommit') &&
    gradle.includes("'READIUM_KOTLIN_REVISION'") &&
    gradle.includes("'NATIVE_EPUB_KIT_VERSION'"),
  'Android support diagnostics must derive package and toolkit revisions from canonical pins.'
);

const plugin = await read('packages/native-epub-kit/plugin/index.js');
invariant(
  plugin.includes("require('../native-dependencies.json')"),
  'The config plugin must read the canonical native pin manifest.'
);
invariant(
  plugin.includes('nativeDependencies.android.coreLibraryDesugaring'),
  'The config plugin must derive desugaring from the pin manifest.'
);

const mainPodspec = await read('packages/native-epub-kit/ios/NativeEpubKit.podspec');
invariant(
  mainPodspec.includes("fetch('integrationVersion')"),
  'The main podspec must derive the Readium integration version.'
);
for (const module of swift.modules) {
  invariant(
    mainPodspec.includes(`s.dependency '${module}', "= #{readium_version}"`),
    `Missing ${module}.`
  );
}

const podspecDirectory = join(packageRoot, 'ios', 'readium-podspecs');
const podspecNames = (await readdir(podspecDirectory))
  .filter((name) => name.endsWith('.podspec'))
  .sort();
invariant(podspecNames.length === 4, 'Exactly four commit-backed Readium podspecs are required.');
for (const name of podspecNames) {
  const contents = await readFile(join(podspecDirectory, name), 'utf8');
  invariant(
    contents.includes("fetch('revision')"),
    `${name} must derive the exact Swift revision.`
  );
  invariant(!contents.includes(':tag'), `${name} must not resolve a floating/release tag.`);
  invariant(!contents.includes("'~>"), `${name} must pin every CocoaPods dependency exactly.`);
}

const swiftModule = await read('packages/native-epub-kit/ios/NativeEpubKitModule.swift');
invariant(
  swiftModule.includes(`readiumSwiftBaseVersion = "${swift.baseVersion}"`),
  'Swift diagnostics base version drifted.'
);
invariant(
  swiftModule.includes(`nativeEpubKitVersion = "${packageMetadata.version}"`) &&
    swiftModule.includes(`readiumSwiftIntegrationVersion = "${swift.integrationVersion}"`),
  'Swift support diagnostics package or integration version drifted.'
);
invariant(
  swiftModule.includes(`readiumSwiftRevision = "${swift.revision}"`),
  'Swift diagnostics revision drifted.'
);

try {
  const installedNavigatorSource = await read(
    'apps/example/ios/Pods/ReadiumNavigator/Sources/Navigator/EPUB/WebViewServer.swift'
  );
  invariant(
    sha256(installedNavigatorSource) === swift.fontCorsQualification.selectedWebViewServerSha256,
    'Installed Readium WebViewServer.swift does not match the qualified selected revision.'
  );
  invariant(
    installedNavigatorSource.includes(swift.fontCorsQualification.requiredResponseHeader),
    'Installed Readium source lacks the required font CORS response header.'
  );
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const kotlinVersions = await read(
  'packages/native-epub-kit/android/src/main/java/com/bilal/nativeepubkit/NativeDependencyVersions.kt'
);
invariant(
  kotlinVersions.includes('BuildConfig.READIUM_KOTLIN_VERSION') &&
    kotlinVersions.includes('BuildConfig.READIUM_KOTLIN_REVISION') &&
    kotlinVersions.includes('BuildConfig.NATIVE_EPUB_KIT_VERSION'),
  'Kotlin support diagnostics must use Gradle-generated package and toolkit pins.'
);

for (const packagedPath of [
  'app.plugin.js',
  'ios/readium-podspecs',
  'native-dependencies.json',
  'plugin/index.js',
]) {
  invariant(
    packageMetadata.files.includes(packagedPath),
    `${packagedPath} is missing from npm files.`
  );
}

console.log(
  `Native pin validation passed (Swift ${swift.baseVersion}@${swift.revision.slice(0, 12)}, Kotlin ${kotlin.version}).`
);
