Pod::Spec.new do |s|
  s.name = 'RoamNavigation'
  s.version = '0.9.0'
  s.summary = 'ROAM provider-neutral navigation bridge'
  s.description = s.summary
  s.author = 'ROAM'
  s.homepage = 'https://github.com/PrithviGhale/Roam'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => s.homepage }
  s.source_files = 'RoamNavigationModule.swift', 'NavigationProvider.swift', 'providers/mapbox/**/*.swift', 'map/**/*.swift', 'providers/google/DisabledGoogleNavigationProvider.swift'
  s.resource_bundles = { 'RoamMapThemes' => ['map/themes/*.json'] }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  spm_dependency(s,
    url: 'https://github.com/mapbox/mapbox-navigation-ios.git',
    requirement: { kind: 'exactVersion', version: '3.32.0' },
    products: ['MapboxNavigationCore'])
end
