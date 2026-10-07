import ExpoModulesCore
import GoogleNavigation
import GoogleMaps

public class RoamNavigationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoamNavigation")
    Events("onNavigationEvent")
    OnCreate { [weak self] in
      DispatchQueue.main.async { NavigationCoordinator.shared.emit = { [weak self] event in self?.sendEvent("onNavigationEvent", event) } }
    }
    OnDestroy { DispatchQueue.main.async { NavigationCoordinator.shared.stop(); NavigationCoordinator.shared.emit = nil } }
    AsyncFunction("availability") { NavigationCoordinator.shared.availability() }.runOnQueue(.main)
    AsyncFunction("start") { (session: String, points: [RoamWaypoint], promise: Promise) in
      NavigationCoordinator.shared.start(session, points) { promise.resolve($0) }
    }.runOnQueue(.main)
    AsyncFunction("update") { (points: [RoamWaypoint], promise: Promise) in
      NavigationCoordinator.shared.replace(points) { promise.resolve($0) }
    }.runOnQueue(.main)
    AsyncFunction("continueTrip") { (promise: Promise) in NavigationCoordinator.shared.continueTrip { promise.resolve($0) } }.runOnQueue(.main)
    AsyncFunction("stop") { NavigationCoordinator.shared.stop() }.runOnQueue(.main)
    AsyncFunction("simulate") { (enabled: Bool) in NavigationCoordinator.shared.simulate(enabled) }.runOnQueue(.main)
    AsyncFunction("licenses") { GMSNavigationServices.openSourceLicenseInfo() + "\n" + GMSServices.openSourceLicenseInfo() }.runOnQueue(.main)
    View(RoamNavigationView.self) {
      Events("onCameraChange")
      Prop("theme") { (view: RoamNavigationView, value: String) in view.overrideUserInterfaceStyle = value == "dark" ? .dark : .light }
      Prop("waypoints") { (view: RoamNavigationView, value: [RoamWaypoint]) in view.destinations(value) }
      Prop("cameraMode") { (view: RoamNavigationView, value: String) in view.cameraMode = value; view.updateCamera() }
      Prop("recenterToken") { (view: RoamNavigationView, value: Int) in if view.recenter != value { view.recenter = value; view.cameraMode = "FOLLOW"; view.updateCamera() } }
      Prop("topInset") { (view: RoamNavigationView, value: Double) in view.topInset = value; view.updatePadding() }
      Prop("bottomInset") { (view: RoamNavigationView, value: Double) in view.bottomInset = value; view.updatePadding() }
      Prop("geometry") { (view: RoamNavigationView, value: [[String: Double]]) in if NavigationCoordinator.shared.session == nil { view.route(value) } }
      Prop("coordinate") { (view: RoamNavigationView, value: [String: Double]?) in view.rawFix(value) }
    }
  }
}
