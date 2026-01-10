require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorLlamaCpp'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = package['repository']['url']
  s.author = package['author']
  s.source = { :git => package['repository']['url'], :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
  
  # llama.cpp specific settings
  s.pod_target_xcconfig = {
    'SWIFT_OBJC_BRIDGING_HEADER' => '$(PODS_TARGET_SRCROOT)/ios/Plugin/llama-bridging-header.h',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY' => 'libc++',
    'OTHER_CFLAGS' => '-DGGML_USE_METAL=1',
    'OTHER_LDFLAGS' => '-framework Metal -framework MetalKit -framework Accelerate'
  }
  
  # Include llama.cpp as vendored framework
  # Note: You'll need to build llama.cpp for iOS and include it as a framework
  # s.vendored_frameworks = 'ios/Frameworks/llama.xcframework'
  
  # Or build from source (requires llama.cpp submodule)
  # s.source_files = 'ios/Plugin/**/*.{swift,h,m}', 'llama.cpp/src/**/*.{c,cpp,h,hpp}', 'llama.cpp/ggml/src/**/*.{c,cpp,h,hpp,m,metal}'
  # s.private_header_files = 'llama.cpp/**/*.h'
  
  # For now, use a placeholder that will be replaced with actual llama.cpp build
  s.preserve_paths = 'ios/Frameworks/**/*'
end
