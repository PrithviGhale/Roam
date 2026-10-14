import Combine
import CoreLocation
import ExpoModulesCore
import MapboxMaps
@_spi(ExperimentalMapboxAPI) import MapboxNavigationCore
import UIKit

/// Mapbox's route renderer/viewport underneath ROAM's React overlays. No stock
/// navigation controller, banners, speech engine, or Google Places markers.
final class MapboxRoamView: ExpoView, NavigationMapViewDelegate {
  let onMapStatus = EventDispatcher()
  let onCameraChange = EventDispatcher()
  private var navigationMap: NavigationMapView?
  private var styleIsDark: Bool?
  private var styleGeneration = 0
  private var geometry: [[String: Double]] = []
  private var previewLine: PolylineAnnotationManager?
  private var previewID = ""
  var recenter = 0
  var cameraMode = "OVERVIEW"
  var topInset: Double = 120
  var bottomInset: Double = 140
  private var previousCameraMode = ""
  private var previousSize = CGSize.zero

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    let engine = MapboxRoamProvider.shared
    guard engine.initialize(), let core = engine.provider else { return }
    let map = NavigationMapView(
      location: engine.locations.compactMap { $0 }.eraseToAnyPublisher(),
      routeProgress: engine.progresses.eraseToAnyPublisher(),
      routeRefreshing: core.mapboxNavigation.navigation().routeRefreshing,
      predictiveCacheManager: core.predictiveCacheManager
    )
    navigationMap = map; engine.view = self
    map.delegate = self
    map.showsAlternatives = false
    map.showsRelativeDurationsOnAlternativeManuever = false
    map.showsIntersectionAnnotations = false
    map.showsTrafficOnRouteLine = false
    map.routeLineTracksTraversal = true
    map.routeColor = UIColor(red: 0.77, green: 0.65, blue: 0.47, alpha: 1)
    map.routeCasingColor = UIColor(white: 0.13, alpha: 1)
    map.traversedRouteColor = UIColor(white: 0.45, alpha: 0.18)
    map.routeAlternateColor = UIColor(white: 0.5, alpha: 0.5)
    map.puckType = .puck2D(Puck2DConfiguration(topImage: Self.puck(), bearingImage: nil, shadowImage: nil, scale: .constant(1)))
    if let viewport = map.navigationCamera.viewportDataSource as? MobileViewportDataSource {
      var options = viewport.options
      options.followingCameraOptions.defaultPitch = 25
      viewport.options = options
    }
    addSubview(map)
    theme("dark")
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    navigationMap?.frame = bounds
    padding()
    if bounds.size != previousSize { previousSize = bounds.size; drawPreview() }
  }
  func padding() {
    guard let map = navigationMap else { return }
    map.viewportPadding = UIEdgeInsets(top: topInset, left: 20, bottom: bottomInset + 38, right: 20)
    // Keep Mapbox logo and attribution controls above the bottom driving chrome.
    map.mapView.ornaments.options.logo.margins = CGPoint(x: 12, y: bottomInset + 12)
    map.mapView.ornaments.options.attributionButton.margins = CGPoint(x: 12, y: bottomInset + 12)
    map.mapView.ornaments.options.compass.visibility = .hidden
    updateCamera()
  }
  func theme(_ value: String) {
    let dark = value == "dark"
    guard dark != styleIsDark, let map = navigationMap else { return }
    styleIsDark = dark
    styleGeneration += 1
    let generation = styleGeneration
    overrideUserInterfaceStyle = dark ? .dark : .light
    RoamMapTheme.load(map.mapView.mapboxMap, dark: dark, isCurrent: { [weak self] in self?.styleGeneration == generation }) { [weak self] ready in
      self?.onMapStatus(["state": ready ? "ready" : "unavailable"])
      if ready { self?.drawPreview() }
    }
  }
  func route(_ values: [[String: Double]]) { geometry = values; drawPreview() }
  func preview(_ id: String) {
    guard id != previewID else { return }
    previewID = id
    drawPreview()
  }
  private func drawPreview() {
    guard let map = navigationMap else { return }
    previewLine?.annotations = []
    guard MapboxRoamProvider.shared.progresses.value == nil else { return }
    if let routes = MapboxRoamProvider.shared.preview(previewID) {
      map.show(routes, routeAnnotationKinds: [])
      fitPreview(routes.mainRoute.route.shape?.coordinates ?? [])
      return
    }
    map.removeRoutes()
    let coordinates = geometry.compactMap { value -> CLLocationCoordinate2D? in
      guard let lat = value["latitude"], let lon = value["longitude"] else { return nil }
      let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
      return CLLocationCoordinate2DIsValid(coordinate) ? coordinate : nil
    }
    guard coordinates.count >= 2 else { return }
    if previewLine == nil { previewLine = map.mapView.annotations.makePolylineAnnotationManager() }
    var line = PolylineAnnotation(lineCoordinates: coordinates)
    line.lineColor = StyleColor(UIColor(red: 0.77, green: 0.65, blue: 0.47, alpha: 1)); line.lineWidth = 5
    previewLine?.annotations = [line]
    fitPreview(coordinates)
  }
  private func fitPreview(_ coordinates: [CLLocationCoordinate2D]) {
    if cameraMode == "OVERVIEW", bounds.width > 0, coordinates.count >= 2, let map = navigationMap {
      if let camera = try? map.mapView.mapboxMap.camera(for: coordinates, camera: CameraOptions(bearing: 0, pitch: 0), coordinatesPadding: map.viewportPadding, maxZoom: 16, offset: nil) { map.mapView.camera.ease(to: camera, duration: 0.3) }
    }
  }
  func updateCamera() {
    guard let map = navigationMap else { return }
    if cameraMode != previousCameraMode {
      previousCameraMode = cameraMode
      map.update(navigationCameraState: cameraMode == "FOLLOW" ? .following : cameraMode == "OVERVIEW" ? .overview : .idle)
      if cameraMode == "OVERVIEW" { drawPreview() }
    }
  }
  func recenterCamera() { previousCameraMode = ""; cameraMode = "FOLLOW"; updateCamera() }
  func navigationMapViewUserDidStartInteraction(_ navigationMapView: NavigationMapView) {
    cameraMode = "FREE"; previousCameraMode = "FREE"
    navigationMapView.navigationCamera.stop()
    onCameraChange(["mode": "FREE"])
  }
  func navigationMapView(_ navigationMapView: NavigationMapView, didAddRedrawActiveGuidanceRoutes navigationRoutes: NavigationRoutes) {
    previewLine?.annotations = []
  }
  func navigationMapView(_ navigationMapView: NavigationMapView, waypointCircleLayerWithIdentifier identifier: String, sourceIdentifier: String) -> CircleLayer? {
    var layer = CircleLayer(id: identifier, source: sourceIdentifier)
    layer.circleColor = .constant(StyleColor(UIColor(red: 0.77, green: 0.65, blue: 0.47, alpha: 1)))
    layer.circleRadius = .constant(7)
    layer.circleStrokeColor = .constant(StyleColor(UIColor(white: 0.13, alpha: 1)))
    layer.circleStrokeWidth = .constant(2)
    return layer
  }
  private static func puck() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 34, height: 42)).image { context in
      let body = UIBezierPath()
      body.move(to: CGPoint(x: 17, y: 3)); body.addLine(to: CGPoint(x: 29, y: 18))
      body.addLine(to: CGPoint(x: 26, y: 36)); body.addLine(to: CGPoint(x: 8, y: 36))
      body.addLine(to: CGPoint(x: 5, y: 18)); body.close()
      UIColor(red: 0.84, green: 0.73, blue: 0.55, alpha: 1).setFill(); body.fill()
      UIColor(white: 0.08, alpha: 1).setStroke(); body.lineWidth = 2.5; body.stroke()
      let lane = UIBezierPath(roundedRect: CGRect(x: 15, y: 14, width: 4, height: 14), cornerRadius: 2)
      UIColor(white: 0.14, alpha: 1).setFill(); lane.fill()
    }
  }
}
