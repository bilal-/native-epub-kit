require 'json'

native_dependencies = JSON.parse(File.read(File.join(__dir__, '..', 'native-dependencies.json')))

Pod::Spec.new do |s|
  readium_version = native_dependencies.fetch('readiumSwift').fetch('integrationVersion')

  s.name = 'NativeEpubKit'
  s.version = '0.1.0'
  s.summary = 'Unofficial native EPUB SDK for Expo and React Native.'
  s.description = 'A headless Expo Modules bridge to the official Readium mobile toolkits.'
  s.author = { 'Bilal' => 'bilal-@users.noreply.github.com' }
  s.homepage = 'https://github.com/bilal-/native-epub-kit'
  s.license = { type: 'MIT', file: '../LICENSE' }
  s.platforms = { ios: '16.4' }
  s.source = {
    git: 'https://github.com/bilal-/native-epub-kit.git',
    tag: s.version.to_s
  }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ReadiumShared', "= #{readium_version}"
  s.dependency 'ReadiumStreamer', "= #{readium_version}"
  s.dependency 'ReadiumNavigator', "= #{readium_version}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
