import Foundation
import MapboxMaps

@MainActor enum RoamMapTheme {
  static func load(_ map: MapboxMap, dark: Bool, isCurrent: @escaping () -> Bool, completion: @escaping (Bool) -> Void) {
    if let configured = Bundle.main.object(forInfoDictionaryKey: "RoamMapStyleURL") as? String,
       configured.hasPrefix("mapbox://styles/"), let uri = StyleURI(rawValue: configured) {
      map.loadStyle(uri) { error in
        guard isCurrent() else { return }
        if error == nil { completion(true) }
        else { bundled(map, dark: dark, isCurrent: isCurrent, completion: completion) }
      }
      return
    }
    bundled(map, dark: dark, isCurrent: isCurrent, completion: completion)
  }
  private static func bundled(_ map: MapboxMap, dark: Bool, isCurrent: @escaping () -> Bool, completion: @escaping (Bool) -> Void) {
    guard isCurrent() else { return }
    let bundleURL = Bundle.main.url(forResource: "RoamMapThemes", withExtension: "bundle")
      ?? Bundle(for: MapboxRoamView.self).url(forResource: "RoamMapThemes", withExtension: "bundle")
    let bundle = bundleURL.flatMap { Bundle(url: $0) }
    if let url = bundle?.url(forResource: dark ? "roam-night" : "roam-day", withExtension: "json"),
       let json = try? String(contentsOf: url, encoding: .utf8) {
      map.loadStyle(json) { error in if isCurrent() { completion(error == nil) } }
    } else { completion(false) }
  }
}
