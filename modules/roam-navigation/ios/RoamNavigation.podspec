Pod::Spec.new do |s|
  s.name = 'RoamNavigation'
  s.version = '0.7.0'
  s.summary = 'ROAM custom Google turn-by-turn guidance'
  s.description = 'Local Expo module using the official Google 11.2.0 binary distribution.'
  s.license = { :type => 'Proprietary' }
  s.author = 'ROAM'
  s.homepage = 'https://github.com/PrithviGhale/Roam'
  s.source = { :git => 'https://github.com/PrithviGhale/Roam.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.vendored_frameworks = 'vendor/GoogleMaps.xcframework', 'vendor/GoogleNavigation.xcframework'
  s.resources = 'vendor/GoogleMaps.bundle', 'vendor/GoogleNavigation.bundle'
  s.libraries = 'c++', 'z', 'xml2'
  s.frameworks = 'Accelerate', 'Contacts', 'CoreData', 'CoreGraphics', 'CoreImage', 'CoreLocation', 'CoreTelephony', 'CoreText', 'GLKit', 'ImageIO', 'Metal', 'OpenGLES', 'QuartzCore', 'Security', 'SystemConfiguration', 'UIKit', 'MetricKit', 'AudioToolbox', 'AVFoundation', 'CarPlay', 'MapKit', 'WebKit', 'UserNotifications'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'OTHER_LDFLAGS' => '$(inherited) -ObjC' }
  s.user_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -ObjC' }
end
