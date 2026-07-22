import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  throw new Error('Swift lifecycle qualification requires macOS/Xcode.');
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'native-epub-kit-swift-'));
const executable = join(temporaryDirectory, 'lifecycle-harness');

try {
  const compile = spawnSync(
    'xcrun',
    [
      'swiftc',
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderLifecycleGate.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderEventProtocol.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/NavigationPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderPreferencesPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderNavigationPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/NavigationUnitBoundaryPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderDiagnosticsPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/NativeFontManifestPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/PublicationDataPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/PublicationSourceResolver.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/PublicationSessionLifecycle.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/SharedRecords.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/TypographyProfilePolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/TypographyStyleInjector.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/TypographyDocumentCodec.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/FootnoteLinkPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderImagePolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/ReaderSearchPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/SelectionActionPolicy.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/SelectionText.swift'),
      resolve(repositoryRoot, 'packages/native-epub-kit/ios/DecorationPolicy.swift'),
      resolve(repositoryRoot, 'packages/testing/native/swift/LifecycleHarnessMain.swift'),
      '-o',
      executable,
    ],
    { stdio: 'inherit' }
  );
  if (compile.status !== 0) process.exit(compile.status ?? 1);

  const run = spawnSync(
    executable,
    [
      resolve(repositoryRoot, 'packages/testing/contracts/lifecycle-v0/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/publication-session-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/reader-api-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/publication-data-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/navigation-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/preferences-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/navigation-policy-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/navigation-boundaries-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/diagnostics-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/font-manifest-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/typography-profile-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/footnote-link-policy-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/selection-action-policy-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/decoration-policy-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/image-policy-v1/cases.json'),
      resolve(repositoryRoot, 'packages/testing/contracts/search-policy-v1/cases.json'),
    ],
    { stdio: 'inherit' }
  );
  process.exit(run.status ?? 1);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
