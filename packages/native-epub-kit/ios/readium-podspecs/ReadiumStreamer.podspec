# Integration metadata derived from Readium Swift's BSD-3-Clause podspec.

require 'json'

native_dependencies = JSON.parse(
  File.read(File.join(__dir__, '..', '..', 'native-dependencies.json'))
).fetch('readiumSwift')
readium_version = native_dependencies.fetch('integrationVersion')
transitive_pods = native_dependencies.fetch('transitivePods')

Pod::Spec.new do |s|
  s.name = 'ReadiumStreamer'
  s.version = readium_version
  s.license = 'BSD 3-Clause License'
  s.summary = 'Readium Streamer'
  s.homepage = 'https://readium.org/swift-toolkit/'
  s.author = { 'Readium' => 'contact@readium.org' }
  s.source = {
    git: 'https://github.com/readium/swift-toolkit.git',
    commit: native_dependencies.fetch('revision')
  }
  s.requires_arc = true
  s.resource_bundles = {
    'ReadiumStreamer' => [
      'Sources/Streamer/Resources/**',
      'Sources/Streamer/Assets'
    ]
  }
  s.source_files = 'Sources/Streamer/**/*.{m,h,swift}'
  s.swift_version = '5.10'
  s.platform = :ios
  s.ios.deployment_target = '15.0'
  s.libraries = 'z', 'xml2'
  s.xcconfig = { 'HEADER_SEARCH_PATHS' => '$(SDKROOT)/usr/include/libxml2' }
  s.pod_target_xcconfig = { 'OTHER_SWIFT_FLAGS' => '-package-name Readium' }

  s.dependency 'ReadiumInternal', "= #{readium_version}"
  s.dependency 'ReadiumShared', "= #{readium_version}"
  s.dependency 'ReadiumFuzi', "= #{transitive_pods.fetch('ReadiumFuzi')}"
  s.dependency 'CryptoSwift', "= #{transitive_pods.fetch('CryptoSwift')}"
end
