import Combine
import CoreLocation
import MapboxDirections
import MapboxNavigationCore
import UIKit

/// A single persistent core. Mapbox objects never cross the Expo boundary.
@MainActor
final class MapboxRoamProvider: RoamNavigationProvider {
  static let shared = MapboxRoamProvider()
  var emit: (([String: Any]) -> Void)?
  weak var view: MapboxRoamView?
  private(set) var provider: MapboxNavigationProvider?
  private var navigation: MapboxNavigationCore.NavigationController?
  private var sessionController: SessionController?
  let locations = CurrentValueSubject<CLLocation?, Never>(nil)
  let progresses = CurrentValueSubject<RouteProgress?, Never>(nil)
  private var subscriptions = Set<AnyCancellable>()
  private var observers: [NSObjectProtocol] = []
  private var cache: [String: (NavigationRoutes, [RoamWaypoint])] = [:]
  private var cacheOrder: [String] = []
  private var plan: [RoamWaypoint] = []
  private var activeRoutes: NavigationRoutes?
  private var activeLeg = 0
  private var waitingLeg: Int?
  private var sessionID = ""
  private var sequence = 0
  private var generation = 0
  private var replacing = false
  // Calculation keeps the old route's guidance alive. Only the brief SDK
  // set-route/acknowledgement window suppresses candidate progress and speech.
  private var committingRoute: Bool { replacing && pendingRoutes != nil }
  private var suspended = false
  private var rawLocation: CLLocation?
  private var lastPublishedRoute: RouteId?
  private var pendingCompletion: ((Bool) -> Void)?
  private var pendingRoutes: NavigationRoutes?
  private var pendingRoutePublications = 0
  private var pendingAcceptedSession = false
  private var pendingPlan: [RoamWaypoint] = []
  private var deadline: DispatchWorkItem?
  private var pendingUI: [String: Any]?
  private var uiFlush: DispatchWorkItem?
  private var lastFlush: TimeInterval = 0

  private var token: String { (Bundle.main.object(forInfoDictionaryKey: "MBXAccessToken") as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
  func preview(_ id: String) -> NavigationRoutes? { cache[id]?.0 }
  func availability() -> [String: Any] {
    let configured = token.hasPrefix("pk.")
    return ["available": configured, "provider": "mapbox", "version": "3.32.0", "mapsVersion": "11.32.0", "tokenConfigured": configured, "initialized": provider != nil, "reason": configured ? "ready" : "missing-public-token"]
  }
  @discardableResult func initialize() -> Bool {
    guard token.hasPrefix("pk.") else { return false }
    if provider != nil { return true }
    let config = CoreConfig(credentials: .init(accessToken: token), locationSource: .live, copilotEnabled: false, disableBackgroundTrackingLocation: true, historyRecordingConfig: nil, multilegAdvancing: .manually { _ in false })
    let core = MapboxNavigationProvider(coreConfig: config)
    provider = core
    navigation = core.mapboxNavigation.navigation()
    sessionController = core.mapboxNavigation.tripSession()
    // Deliberately never access core.routeVoiceController: ROAM owns TTS.
    observe()
    return true
  }
  private func observe() {
    guard let nav = navigation, let sessions = sessionController else { return }
    nav.routeProgress.receive(on: DispatchQueue.main).sink { [weak self] value in
      guard let self, !self.sessionID.isEmpty, !self.committingRoute, !self.suspended, let progress = value?.routeProgress else { return }
      self.activeRoutes = progress.navigationRoutes
      self.activeLeg = progress.legIndex
      self.progresses.send(progress)
      self.publishRoute(progress.navigationRoutes)
      if let guidance = MapboxGuidanceAdapter.guidance(progress) {
        var fields: [String: Any] = ["guidance": guidance]
        if let fix = self.locations.value { fields["location"] = Self.fix(fix) }
        fields["road"] = nav.currentLocationMatching?.roadName?.text ?? ""
        self.coalesce(fields)
      }
    }.store(in: &subscriptions)
    nav.locationMatching.receive(on: DispatchQueue.main).sink { [weak self] state in
      guard let self, !self.sessionID.isEmpty, !self.suspended, !self.committingRoute else { return }
      let fix = state.enhancedLocation
      guard CLLocationCoordinate2DIsValid(fix.coordinate), abs(fix.timestamp.timeIntervalSinceNow) <= 15, fix.horizontalAccuracy >= 0 else { return }
      self.locations.send(fix)
    }.store(in: &subscriptions)
    sessions.session.dropFirst().receive(on: DispatchQueue.main).sink { [weak self] state in
      guard let self, self.replacing, let candidate = self.pendingRoutes else { return }
      if case .activeGuidance(.uncertain) = state.state,
         sessions.currentNavigationRoutes?.mainRoute.routeId == candidate.mainRoute.routeId {
        self.pendingAcceptedSession = true
        self.confirmReplacement()
      }
    }.store(in: &subscriptions)
    sessions.navigationRoutes.dropFirst().receive(on: DispatchQueue.main).sink { [weak self] routes in
      guard let self, self.committingRoute, let candidate = self.pendingRoutes,
            routes?.mainRoute.routeId == candidate.mainRoute.routeId else { return }
      // Pinned 3.32.0 publishes once optimistically, then again after the native
      // setRoutes success callback. Session events alone are deduplicated when
      // guidance was already uncertain. Never accept the optimistic publication.
      self.pendingRoutePublications += 1
      self.confirmReplacement()
    }.store(in: &subscriptions)
    nav.errors.receive(on: DispatchQueue.main).sink { [weak self] error in
      guard let self else { return }
      if error is NavigatorErrors.FailedToSetRoute, self.committingRoute { self.finishReplacement(false) }
      else if !self.sessionID.isEmpty { self.event("error", ["message": "Navigation needs attention. Your trip is kept."]) }
    }.store(in: &subscriptions)
    nav.rerouting.receive(on: DispatchQueue.main).sink { [weak self] state in
      guard let self, !self.sessionID.isEmpty, !self.committingRoute else { return }
      if state.event is ReroutingStatus.Events.FetchingRoute { self.pendingUI = nil; self.event("rerouting") }
      else { self.event("rerouted") }
    }.store(in: &subscriptions)
    nav.voiceInstructions.receive(on: DispatchQueue.main).sink { [weak self] state in
      guard let self, !self.sessionID.isEmpty, !self.committingRoute, !self.suspended, self.waitingLeg == nil else { return }
      let instruction = state.spokenInstruction
      let text = String(instruction.text.prefix(1000))
      if !text.isEmpty { self.event("voice", ["voice": ["text": text, "critical": instruction.distanceAlongStep <= 60]]) }
    }.store(in: &subscriptions)
    nav.waypointsArrival.receive(on: DispatchQueue.main).sink { [weak self] arrival in
      guard let self, !self.sessionID.isEmpty, !self.committingRoute else { return }
      if arrival.event is WaypointArrivalStatus.Events.ToFinalDestination {
        self.event("arrival"); self.stop(emitStopped: false)
      } else if let waypoint = arrival.event as? WaypointArrivalStatus.Events.ToWaypoint,
                self.plan.indices.contains(waypoint.legIndex), self.waitingLeg == nil {
        self.waitingLeg = waypoint.legIndex
        self.event("waypoint", ["waypointId": self.plan[waypoint.legIndex].id])
      } else if arrival.event is WaypointArrivalStatus.Events.NextLegStarted { self.waitingLeg = nil }
    }.store(in: &subscriptions)
  }
  static func fix(_ location: CLLocation) -> [String: Double] {
    var value = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude]
    if location.course.isFinite && location.course >= 0 { value["heading"] = location.course }
    return value
  }
  func rawFix(_ value: [String: Double]?) {
    guard sessionID.isEmpty, let value, let lat = value["latitude"], let lon = value["longitude"] else { return }
    let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
    guard CLLocationCoordinate2DIsValid(coordinate) else { return }
    rawLocation = CLLocation(coordinate: coordinate, altitude: 0, horizontalAccuracy: 10, verticalAccuracy: -1, course: value["heading"] ?? -1, speed: 0, timestamp: Date())
    locations.send(rawLocation)
  }
  private func valid(_ points: [RoamWaypoint]) -> Bool {
    !points.isEmpty && points.count <= 6 && points.allSatisfy { !$0.id.isEmpty && $0.latitude.isFinite && $0.longitude.isFinite && CLLocationCoordinate2DIsValid($0.coordinate) }
  }
  func calculate(_ origin: [String: Double], _ points: [RoamWaypoint]) async throws -> [String: Any] {
    guard initialize(), valid(points), let lat = origin["latitude"], let lon = origin["longitude"], lat.isFinite, lon.isFinite,
          CLLocationCoordinate2DIsValid(.init(latitude: lat, longitude: lon)), let provider else { throw RoamRoutingError.unavailable }
    let coords = [CLLocationCoordinate2D(latitude: lat, longitude: lon)] + points.map(\.coordinate)
    let options = NavigationRouteOptions(coordinates: coords, profileIdentifier: .automobileAvoidingTraffic)
    options.includesAlternativeRoutes = false
    let routes = try await provider.routingProvider().calculateRoutes(options: options).value
    let id = UUID().uuidString
    cache[id] = (routes, points); cacheOrder.append(id)
    while cacheOrder.count > 16 { cache.removeValue(forKey: cacheOrder.removeFirst()) }
    return Self.route(routes, id: id, coordinates: coords)
  }
  private static func route(_ routes: NavigationRoutes, id: String, coordinates: [CLLocationCoordinate2D]) -> [String: Any] {
    let route = routes.mainRoute.route
    let geometry = route.shape?.coordinates.map { ["latitude": $0.latitude, "longitude": $0.longitude] } ?? []
    let legs: [[String: Any]] = route.legs.enumerated().map { index, leg in
      ["distanceMeters": leg.distance, "durationSeconds": leg.expectedTravelTime, "start": ["latitude": coordinates[index].latitude, "longitude": coordinates[index].longitude], "end": ["latitude": coordinates[index + 1].latitude, "longitude": coordinates[index + 1].longitude]]
    }
    return ["id": id, "provider": "mapbox", "geometry": geometry, "distanceMeters": route.distance, "durationSeconds": route.expectedTravelTime, "legs": legs, "calculatedAt": ISO8601DateFormatter().string(from: Date())]
  }
  func start(_ session: String, _ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void) {
    guard sessionID.isEmpty, initialize(), UIApplication.shared.applicationState == .active else { completion(false); return }
    sessionID = session; sequence = 0
    replace(points, routeID: routeID) { [weak self] accepted in
      if accepted { self?.installLifecycle() } else { self?.sessionID = "" }
      completion(accepted)
    }
  }
  func replace(_ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void) {
    guard !sessionID.isEmpty, !replacing, valid(points), !suspended, waitingLeg == nil else { completion(false); return }
    replacing = true; pendingCompletion = completion; pendingPlan = points
    let epoch = generation
    Task { @MainActor [weak self] in
      guard let self else { return }
      var candidate: NavigationRoutes?
      if let id = routeID, let stored = self.cache[id], stored.1.map(\.id) == points.map(\.id) { candidate = stored.0 }
      else if let fix = self.locations.value ?? self.rawLocation, abs(fix.timestamp.timeIntervalSinceNow) <= 15 {
        do {
          let result = try await self.calculate(Self.fix(fix), points)
          if let id = result["id"] as? String { candidate = self.cache[id]?.0 }
        } catch {}
      }
      guard epoch == self.generation, self.replacing else { return }
      guard self.waitingLeg == nil else { self.finishReplacement(false); return }
      guard let candidate else { self.finishReplacement(false); return }
      self.pendingRoutes = candidate
      self.pendingRoutePublications = 0
      if let session = self.sessionController?.currentSession, case .activeGuidance(.uncertain) = session.state {
        self.pendingAcceptedSession = true
      } else { self.pendingAcceptedSession = false }
      let timeout = DispatchWorkItem { [weak self] in self?.finishReplacement(false) }
      self.deadline = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
      self.sessionController?.startActiveGuidance(with: candidate, startLegIndex: 0)
    }
  }
  private func confirmReplacement() {
    guard replacing, pendingRoutePublications >= 2, pendingAcceptedSession,
          let candidate = pendingRoutes,
          navigation?.currentRouteProgress?.routeProgress.navigationRoutes.mainRoute.routeId == candidate.mainRoute.routeId else { return }
    finishReplacement(true)
  }
  private func finishReplacement(_ accepted: Bool) {
    guard replacing else { return }
    deadline?.cancel(); deadline = nil
    let candidate = pendingRoutes
    let completion = pendingCompletion
    pendingCompletion = nil; pendingRoutes = nil; replacing = false
    pendingRoutePublications = 0; pendingAcceptedSession = false
    if accepted, let candidate {
      activeRoutes = candidate; plan = pendingPlan; activeLeg = 0
      pendingUI = nil; lastPublishedRoute = nil
      event("started"); publishRoute(candidate)
      if let progress = navigation?.currentRouteProgress?.routeProgress { progresses.send(progress) }
    } else if let activeRoutes, candidate != nil {
      // Restore the retained route if the SDK's setRoutes fails or times out.
      sessionController?.startActiveGuidance(with: activeRoutes, startLegIndex: activeLeg)
    } else if activeRoutes == nil { sessionController?.setToIdle() }
    pendingPlan = []; completion?(accepted)
  }
  func continueTrip(completion: @escaping (Bool) -> Void) {
    guard let leg = waitingLeg, leg + 1 < plan.count, let nav = navigation else { completion(false); return }
    // Wait for the SDK's NextLegStarted acknowledgement, rather than assuming
    // the void switchLeg call succeeded.
    var acknowledgement: AnyCancellable?
    var timeout: DispatchWorkItem?
    var done = false
    let finish: (Bool) -> Void = { result in
      guard !done else { return }; done = true
      timeout?.cancel(); acknowledgement?.cancel(); completion(result)
    }
    acknowledgement = nav.waypointsArrival.receive(on: DispatchQueue.main).sink { [weak self] status in
      if let next = status.event as? WaypointArrivalStatus.Events.NextLegStarted, next.newLegIndex == leg + 1 {
        self?.waitingLeg = nil; finish(true)
      }
    }
    let work = DispatchWorkItem { finish(false) }; timeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
    nav.switchLeg(newLegIndex: leg + 1)
  }
  func stop() { stop(emitStopped: true) }
  private func stop(emitStopped: Bool) {
    generation += 1; deadline?.cancel(); deadline = nil
    pendingCompletion?(false); pendingCompletion = nil; replacing = false; pendingRoutes = nil
    pendingRoutePublications = 0; pendingAcceptedSession = false
    uiFlush?.cancel(); uiFlush = nil; pendingUI = nil
    sessionController?.setToIdle()
    #if DEBUG
    if let provider { var config = provider.coreConfig; config.locationSource = .live; provider.apply(coreConfig: config) }
    #endif
    if emitStopped && !sessionID.isEmpty { event("stopped") }
    sessionID = ""; plan = []; activeRoutes = nil; waitingLeg = nil; suspended = false; lastPublishedRoute = nil
    progresses.send(nil); locations.send(nil)
    observers.forEach(NotificationCenter.default.removeObserver); observers = []
  }
  func simulate(_ enabled: Bool) {
    #if DEBUG
    guard let provider, !sessionID.isEmpty, !replacing else { return }
    var config = provider.coreConfig
    config.locationSource = enabled ? .simulation() : .live
    provider.apply(coreConfig: config)
    event("rerouted", ["message": enabled ? "simulation-on" : "simulation-off"])
    #endif
  }
  private func installLifecycle() {
    guard observers.isEmpty else { return }
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self else { return }; self.suspended = true; self.pendingUI = nil
        if self.replacing { self.finishReplacement(false) }
        self.sessionController?.setToIdle()
      }
    })
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, self.suspended, let routes = self.activeRoutes else { return }
        self.suspended = false
        self.sessionController?.startActiveGuidance(with: routes, startLegIndex: self.activeLeg)
      }
    })
  }
  private func publishRoute(_ routes: NavigationRoutes) {
    guard lastPublishedRoute != routes.mainRoute.routeId else { return }
    lastPublishedRoute = routes.mainRoute.routeId
    // SDK reroutes may rebase the route to remaining legs after a visited stop.
    // Rebase the ID plan too, so the next arrival still refers to the right stop.
    let legCount = routes.mainRoute.route.legs.count
    if legCount < plan.count { plan = Array(plan.suffix(legCount)) }
    let geometry = routes.mainRoute.route.shape?.coordinates.map { ["latitude": $0.latitude, "longitude": $0.longitude] } ?? []
    let coordinates = routes.waypoints.map(\.coordinate)
    if coordinates.count == routes.mainRoute.route.legs.count + 1 {
      let id = UUID().uuidString
      cache[id] = (routes, plan); cacheOrder.append(id)
      while cacheOrder.count > 16 { cache.removeValue(forKey: cacheOrder.removeFirst()) }
      event("route", ["geometry": geometry, "route": Self.route(routes, id: id, coordinates: coordinates)])
    } else { event("route", ["geometry": geometry]) }
  }
  private func coalesce(_ fields: [String: Any]) {
    pendingUI = fields
    guard uiFlush == nil else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }; self.uiFlush = nil
      guard !self.committingRoute, !self.suspended, let fields = self.pendingUI else { return }
      self.pendingUI = nil; self.lastFlush = Date().timeIntervalSince1970; self.event("guidance", fields)
    }
    uiFlush = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, 0.5 - (Date().timeIntervalSince1970 - lastFlush)), execute: work)
  }
  private func event(_ kind: String, _ fields: [String: Any] = [:]) {
    guard !sessionID.isEmpty else { return }; sequence += 1
    emit?(fields.merging(["session": sessionID, "sequence": sequence, "timestamp": Date().timeIntervalSince1970 * 1000, "kind": kind, "provider": "mapbox"]) { _, envelope in envelope })
  }
}
enum RoamRoutingError: Error { case unavailable }
