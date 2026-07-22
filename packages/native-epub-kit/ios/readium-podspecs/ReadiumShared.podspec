# Integration metadata derived from Readium Swift's BSD-3-Clause podspec.

require 'json'

native_dependencies = JSON.parse(
  File.read(File.join(__dir__, '..', '..', 'native-dependencies.json'))
).fetch('readiumSwift')
readium_version = native_dependencies.fetch('integrationVersion')
transitive_pods = native_dependencies.fetch('transitivePods')

Pod::Spec.new do |s|
  s.name = 'ReadiumShared'
  s.version = readium_version
  s.license = 'BSD 3-Clause License'
  s.summary = 'Readium Shared'
  s.homepage = 'https://readium.org/swift-toolkit/'
  s.author = { 'Readium' => 'contact@readium.org' }
  s.source = {
    git: 'https://github.com/readium/swift-toolkit.git',
    commit: native_dependencies.fetch('revision')
  }
  s.requires_arc = true
  s.resource_bundles = {
    'ReadiumShared' => ['Sources/Shared/Resources/**']
  }
  s.source_files = 'Sources/Shared/**/*.{m,h,swift}'
  s.swift_version = '5.10'
  s.platform = :ios
  s.ios.deployment_target = '15.0'
  s.frameworks = 'CoreServices'
  s.libraries = 'xml2'
  s.xcconfig = { 'HEADER_SEARCH_PATHS' => '$(SDKROOT)/usr/include/libxml2' }
  s.pod_target_xcconfig = { 'OTHER_SWIFT_FLAGS' => '-package-name Readium' }

  s.dependency 'ReadiumInternal', "= #{readium_version}"
  s.dependency 'Minizip', "= #{transitive_pods.fetch('Minizip')}"
  s.dependency 'SwiftSoup', "= #{transitive_pods.fetch('SwiftSoup')}"
  s.dependency 'ReadiumFuzi', "= #{transitive_pods.fetch('ReadiumFuzi')}"
  s.dependency 'ReadiumZIPFoundation', "= #{transitive_pods.fetch('ReadiumZIPFoundation')}"
end
