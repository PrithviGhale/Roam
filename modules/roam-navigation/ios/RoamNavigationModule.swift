import ExpoModulesCore

public class RoamNavigationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoamNavigation")
    Events("onNavigationEvent")
    OnCreate { [weak self] in DispatchQueue.main.async {
      NavigationProviderRegistry.selected.emit = { [weak self] in self?.sendEvent("onNavigationEvent", $0) }
    } }
    OnDestroy { DispatchQueue.main.async { NavigationProviderRegistry.selected.stop(); NavigationProviderRegistry.selected.emit = nil } }
    AsyncFunction("availability") { MainActor.assumeIsolated { NavigationProviderRegistry.selected.availability() } }.runOnQueue(.main)
    AsyncFunction("calculateRoute") { (origin: [String: Double], points: [RoamWaypoint], promise: Promise) in
      Task { @MainActor in
        do { promise.resolve(try await NavigationProviderRegistry.selected.calculate(origin, points)) }
        catch { promise.reject("ROUTE_UNAVAILABLE", "Mapbox could not calculate this route. Your current trip is kept.") }
      }
    }.runOnQueue(.main)
    AsyncFunction("start") { (session: String, points: [RoamWaypoint], routeID: String?, promise: Promise) in
      MainActor.assumeIsolated { NavigationProviderRegistry.selected.start(session, points, routeID: routeID) { promise.resolve($0) } }
    }.runOnQueue(.main)
    AsyncFunction("update") { (points: [RoamWaypoint], routeID: String?, promise: Promise) in
      MainActor.assumeIsolated { NavigationProviderRegistry.selected.replace(points, routeID: routeID) { promise.resolve($0) } }
    }.runOnQueue(.main)
    AsyncFunction("continueTrip") { (promise: Promise) in
      MainActor.assumeIsolated { NavigationProviderRegistry.selected.continueTrip { promise.resolve($0) } }
    }.runOnQueue(.main)
    AsyncFunction("stop") { MainActor.assumeIsolated { NavigationProviderRegistry.selected.stop() } }.runOnQueue(.main)
    AsyncFunction("simulate") { (enabled: Bool) in MainActor.assumeIsolated { NavigationProviderRegistry.selected.simulate(enabled) } }.runOnQueue(.main)
    AsyncFunction("licenses") { "Mapbox Maps and Navigation: https://www.mapbox.com/about/maps/\nSDK source licenses: https://github.com/mapbox/mapbox-navigation-ios/blob/3.32.0/LICENSE.md\nMapbox and OpenStreetMap attribution stays visible in the map's attribution control." }.runOnQueue(.main)
    View(MapboxRoamView.self) {
      Events("onCameraChange")
      Prop("theme") { (view: MapboxRoamView, value: String) in view.theme(value) }
      Prop("waypoints") { (_: MapboxRoamView, _: [RoamWaypoint]) in } // map shows SDK waypoints only
      Prop("cameraMode") { (view: MapboxRoamView, value: String) in view.cameraMode = value; view.updateCamera() }
      Prop("recenterToken") { (view: MapboxRoamView, value: Int) in if view.recenter != value { view.recenter = value; view.recenterCamera() } }
      Prop("topInset") { (view: MapboxRoamView, value: Double) in view.topInset = value; view.padding() }
      Prop("bottomInset") { (view: MapboxRoamView, value: Double) in view.bottomInset = value; view.padding() }
      Prop("geometry") { (view: MapboxRoamView, value: [[String: Double]]) in view.route(value) }
      Prop("routeID") { (view: MapboxRoamView, value: String) in view.preview(value) }
      Prop("coordinate") { (_: MapboxRoamView, value: [String: Double]?) in MapboxRoamProvider.shared.rawFix(value) }
    }
  }
}
