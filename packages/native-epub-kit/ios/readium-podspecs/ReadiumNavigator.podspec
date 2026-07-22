# Integration metadata derived from Readium Swift's BSD-3-Clause podspec.

require 'json'

native_dependencies = JSON.parse(
  File.read(File.join(__dir__, '..', '..', 'native-dependencies.json'))
).fetch('readiumSwift')
readium_version = native_dependencies.fetch('integrationVersion')
transitive_pods = native_dependencies.fetch('transitivePods')

Pod::Spec.new do |s|
  s.name = 'ReadiumNavigator'
  s.version = readium_version
  s.license = 'BSD 3-Clause License'
  s.summary = 'Readium Navigator'
  s.homepage = 'https://readium.org/swift-toolkit/'
  s.author = { 'Readium' => 'contact@readium.org' }
  s.source = {
    git: 'https://github.com/readium/swift-toolkit.git',
    commit: native_dependencies.fetch('revision')
  }
  s.requires_arc = true
  s.resource_bundles = {
    'ReadiumNavigator' => [
      'Sources/Navigator/Resources/**',
      'Sources/Navigator/EPUB/Assets'
    ]
  }
  s.source_files = 'Sources/Navigator/**/*.{m,h,swift}'
  s.swift_version = '5.10'
  s.platform = :ios
  s.ios.deployment_target = '15.0'
  s.pod_target_xcconfig = { 'OTHER_SWIFT_FLAGS' => '-package-name Readium' }

  s.dependency 'ReadiumInternal', "= #{readium_version}"
  s.dependency 'ReadiumShared', "= #{readium_version}"
  s.dependency 'DifferenceKit', "= #{transitive_pods.fetch('DifferenceKit')}"
  s.dependency 'SwiftSoup', "= #{transitive_pods.fetch('SwiftSoup')}"
end
