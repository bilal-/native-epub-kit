# Integration metadata derived from Readium Swift's BSD-3-Clause podspec.

require 'json'

native_dependencies = JSON.parse(
  File.read(File.join(__dir__, '..', '..', 'native-dependencies.json'))
).fetch('readiumSwift')

Pod::Spec.new do |s|
  s.name = 'ReadiumInternal'
  s.version = native_dependencies.fetch('integrationVersion')
  s.license = 'BSD 3-Clause License'
  s.summary = 'Private utilities used by the Readium modules'
  s.homepage = 'https://readium.org/swift-toolkit/'
  s.author = { 'Readium' => 'contact@readium.org' }
  s.source = {
    git: 'https://github.com/readium/swift-toolkit.git',
    commit: native_dependencies.fetch('revision')
  }
  s.requires_arc = true
  s.source_files = 'Sources/Internal/**/*.{m,h,swift}'
  s.swift_version = '5.10'
  s.platform = :ios
  s.ios.deployment_target = '15.0'
  s.xcconfig = { 'HEADER_SEARCH_PATHS' => '$(SDKROOT)/usr/include/libxml2' }
  s.pod_target_xcconfig = { 'OTHER_SWIFT_FLAGS' => '-package-name Readium' }
end
