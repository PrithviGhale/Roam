import GoogleMaps
import GoogleNavigation
import UIKit
import CoreLocation
import ExpoModulesCore

struct RoamWaypoint: Record {
  @Field var id: String = ""
  @Field var name: String = ""
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
}

// Every entry point and SDK callback runs on the main queue. No location or road history.
final class NavigationCoordinator: NSObject, GMSNavigatorListener, GMSRoadSnappedLocationProviderListener {
  static let shared = NavigationCoordinator()
  var emit: (([String: Any]) -> Void)?
  weak var view: RoamNavigationView?
  private(set) var session: GMSNavigationSession?
  private var staging: GMSNavigationSession?
  private var pending: ((Bool) -> Void)?
  private var timeout: DispatchWorkItem?
  private var sessionID = ""
  private var sequence = 0
  private var generation = 0
  private var plan: [RoamWaypoint] = []
  private var waitingAtStop = false
  private var foregroundObservers: [NSObjectProtocol] = []
  private var configured = false

  func configureMaps() -> Bool {
    if configured { return true }
    guard let key = Bundle.main.object(forInfoDictionaryKey: "ROAMGoogleMapsKey") as? String, !key.isEmpty else { return false }
    configured = GMSServices.provideAPIKey(key)
    return configured
  }
  func availability() -> [String: Any] {
    let enabled = Bundle.main.object(forInfoDictionaryKey: "ROAMNavigationEnabled") as? Bool == true
    return ["available": enabled && configureMaps(), "reason": enabled ? "missing-key-or-initialization" : "project-not-enabled", "version": "11.2.0"]
  }
  private func event(_ kind: String, _ fields: [String: Any] = [:]) {
    guard !sessionID.isEmpty else { return }
    sequence += 1
    var payload = fields
    payload.merge(["kind": kind, "session": sessionID, "sequence": sequence,
      "timestamp": Date().timeIntervalSince1970 * 1000]) { _, new in new }
    emit?(payload)
  }
  func start(_ id: String, _ points: [RoamWaypoint], completion: @escaping (Bool) -> Void) {
    stop()
    guard availability()["available"] as? Bool == true else { completion(false); return }
    sessionID = id; sequence = 0
    let token = generation
    pending = completion
    let options = GMSNavigationTermsAndConditionsOptions(companyName: "ROAM")
    GMSNavigationServices.showTermsAndConditionsDialogIfNeeded(with: options) { [weak self] accepted in
      guard let self, self.generation == token else { return }
      self.pending = nil
      guard accepted else { completion(false); return }
      self.replace(points, completion: completion)
    }
  }
  func replace(_ points: [RoamWaypoint], completion: @escaping (Bool) -> Void) {
    guard UIApplication.shared.applicationState == .active, staging == nil, !waitingAtStop, !points.isEmpty, points.count <= 6,
      let candidate = GMSNavigationServices.createNavigationSession(), let navigator = candidate.navigator else { completion(false); return }
    let waypoints = points.compactMap { point -> GMSNavigationWaypoint? in
      let coordinate = CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)
      guard CLLocationCoordinate2DIsValid(coordinate), !point.id.isEmpty else { return nil }
      return GMSNavigationWaypoint(location: coordinate, title: point.name)
    }
    guard waypoints.count == points.count else { completion(false); return }
    staging = candidate; pending = completion
    let token = generation
    candidate.travelMode = .driving
    candidate.isStarted = true
    navigator.voiceGuidance = .silent
    navigator.sendsBackgroundNotifications = false
    let timer = DispatchWorkItem { [weak self, weak candidate] in
      guard let self, let candidate, self.staging === candidate else { return }
      self.release(candidate); self.staging = nil; self.pending = nil; completion(false)
    }
    timeout = timer; DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timer)
    navigator.setDestinations(waypoints) { [weak self, weak candidate] status in
      guard let self, let candidate, self.generation == token, self.staging === candidate else { return }
      self.timeout?.cancel(); self.timeout = nil; self.staging = nil; self.pending = nil
      guard status == .OK, UIApplication.shared.applicationState == .active else { self.release(candidate); completion(false); return }
      // Commit the accepted candidate; the previous route stays untouched until this point.
      self.release(self.session); self.session = candidate; self.plan = points
      navigator.add(self); navigator.stopGuidanceAtArrival = true
      candidate.roadSnappedLocationProvider?.add(self)
      candidate.roadSnappedLocationProvider?.allowsBackgroundLocationUpdates = false
      candidate.roadSnappedLocationProvider?.startUpdatingLocation()
      navigator.isGuidanceActive = true
      self.observeForeground()
      self.view?.attach(candidate)
      self.event("started"); self.publishRoute(); completion(true)
    }
  }
  private func release(_ value: GMSNavigationSession?) {
    value?.locationSimulator?.stopSimulation()
    value?.navigator?.isGuidanceActive = false
    value?.navigator?.remove(self)
    value?.roadSnappedLocationProvider?.remove(self)
    value?.roadSnappedLocationProvider?.stopUpdatingLocation()
    value?.navigator?.clearDestinations()
    value?.isStarted = false
  }
  func stop() {
    generation += 1; timeout?.cancel(); timeout = nil
    let callback = pending; pending = nil
    release(staging); staging = nil; release(session); session = nil
    foregroundObservers.forEach { NotificationCenter.default.removeObserver($0) }; foregroundObservers.removeAll()
    view?.attach(nil); event("stopped"); sessionID = ""; plan = []; waitingAtStop = false
    callback?(false)
  }
  private func observeForeground() {
    guard foregroundObservers.isEmpty else { return }
    foregroundObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      self?.session?.roadSnappedLocationProvider?.stopUpdatingLocation(); self?.session?.isStarted = false
    })
    foregroundObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self else { return }; self.session?.isStarted = true; self.session?.roadSnappedLocationProvider?.startUpdatingLocation()
    })
  }
  func continueTrip(_ completion: @escaping (Bool) -> Void) {
    guard waitingAtStop, let current = session else { completion(false); return }
    // Stage the remaining plan too: failed advancement retains the arrived waypoint.
    waitingAtStop = false
    replace(Array(plan.dropFirst())) { [weak self] accepted in
      if !accepted, self?.session === current { self?.waitingAtStop = true }
      completion(accepted)
    }
  }
  func simulate(_ enabled: Bool) {
    #if DEBUG
    if enabled { session?.locationSimulator?.simulateLocationsAlongExistingRoute() }
    else { session?.locationSimulator?.stopSimulation() }
    #endif
  }
  func navigator(_ navigator: GMSNavigator, didUpdateNavInfo info: GMSNavigationNavInfo) {
    guard navigator === session?.navigator else { return }
    if info.navState == .rerouting { event("rerouting"); return }
    if let guidance = GuidanceAdapter.guidance(info) { event("guidance", ["guidance": guidance]) }
    if info.routeChanged { publishRoute() }
  }
  func navigatorDidChangeRoute(_ navigator: GMSNavigator) {
    if navigator === session?.navigator { publishRoute() }
  }
  private func publishRoute() {
    guard let legs = session?.navigator?.routeLegs else { return }
    let points = legs.flatMap { leg -> [[String: Double]] in
      guard let path = leg.path else { return [] }
      return (0..<path.count()).map { index in let c = path.coordinate(at: index); return ["latitude": c.latitude, "longitude": c.longitude] }
    }
    if !points.isEmpty { view?.route(points); event("route", ["geometry": points]) }
  }
  func navigator(_ navigator: GMSNavigator, didArriveAt waypoint: GMSNavigationWaypoint) {
    guard navigator === session?.navigator, !waitingAtStop, let point = plan.first else { return }
    if plan.count > 1 { waitingAtStop = true; event("waypoint", ["waypointId": point.id]) }
    else {
      event("arrival", ["waypointId": point.id]); release(session); session = nil; view?.attach(nil)
      foregroundObservers.forEach { NotificationCenter.default.removeObserver($0) }; foregroundObservers.removeAll()
    }
  }
  func locationProvider(_ provider: GMSRoadSnappedLocationProvider, didUpdate location: CLLocation) {
    guard provider === session?.roadSnappedLocationProvider, CLLocationCoordinate2DIsValid(location.coordinate),
      abs(location.timestamp.timeIntervalSinceNow) <= 15 else { return }
    var fix: [String: Double] = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude]
    if location.course >= 0 { fix["heading"] = location.course }
    view?.fix(location)
    event("location", ["location": fix])
  }
}
