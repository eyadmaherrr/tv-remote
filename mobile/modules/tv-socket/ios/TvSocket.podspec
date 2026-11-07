Pod::Spec.new do |s|
  s.name           = 'TvSocket'
  s.version        = '1.0.0'
  s.summary        = 'WebSocket + HTTPS to a Samsung TV that trusts only its SmartViewSDK certificate'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'tv-remote'
  s.homepage       = 'https://github.com/eyadmaherrr/tv-remote'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/eyadmaherrr/tv-remote.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
