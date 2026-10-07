import Combine
import CoreLocation
import ExpoModulesCore
import MapboxMaps
@_spi(ExperimentalMapboxAPI) import MapboxNavigationCore
import UIKit

/// Mapbox's route renderer/viewport underneath ROAM's React overlays. No stock
/// navigation controller, banners, speech engine, or Google Places markers.
final class MapboxRoamView: ExpoView, NavigationMapViewDelegate {
  let onCameraChange = EventDispatcher()
  private var navigationMap: NavigationMapView?
  private var styleIsDark: Bool?
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
    map.traversedRouteColor = UIColor(white: 0.45, alpha: 0.25)
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
    overrideUserInterfaceStyle = dark ? .dark : .light
    map.mapView.mapboxMap.loadStyle(Self.style(dark: dark)) { [weak self] _ in self?.drawPreview() }
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
    UIGraphicsImageRenderer(size: CGSize(width: 42, height: 48)).image { context in
      let path = UIBezierPath()
      path.move(to: CGPoint(x: 21, y: 3)); path.addLine(to: CGPoint(x: 36, y: 41)); path.addLine(to: CGPoint(x: 21, y: 32)); path.addLine(to: CGPoint(x: 6, y: 41)); path.close()
      UIColor(red: 0.84, green: 0.73, blue: 0.55, alpha: 1).setFill(); path.fill()
      UIColor(white: 0.12, alpha: 1).setStroke(); path.lineWidth = 3; path.stroke()
    }
  }
  private static func style(dark: Bool) -> String {
    // Original sparse vector style using Mapbox Streets data. Legal attribution
    // remains in source metadata and the SDK's ornament controls.
    let bg = dark ? "#101316" : "#eeeae2"
    let land = dark ? "#171d1c" : "#d9dfd3"
    let water = dark ? "#15212b" : "#bfd3db"
    let road = dark ? "#394047" : "#ffffff"
    let labels = dark ? "#aab0b3" : "#575d62"
    return """
    {"version":8,"name":"ROAM \(dark ? "Dark" : "Light")","glyphs":"mapbox://fonts/mapbox/{fontstack}/{range}.pbf","sources":{"streets":{"type":"vector","url":"mapbox://mapbox.mapbox-streets-v8"}},"layers":[
    {"id":"background","type":"background","paint":{"background-color":"\(bg)"}},
    {"id":"landuse","type":"fill","source":"streets","source-layer":"landuse","paint":{"fill-color":"\(land)","fill-opacity":0.65}},
    {"id":"water","type":"fill","source":"streets","source-layer":"water","paint":{"fill-color":"\(water)"}},
    {"id":"roads","type":"line","source":"streets","source-layer":"road","filter":["!=",["get","class"],"path"],"layout":{"line-cap":"round","line-join":"round"},"paint":{"line-color":"\(road)","line-width":["interpolate",["linear"],["zoom"],8,0.6,15,3,19,12]}},
    {"id":"road-labels","type":"symbol","source":"streets","source-layer":"road","minzoom":12,"layout":{"symbol-placement":"line","text-field":["get","name"],"text-font":["DIN Pro Regular","Arial Unicode MS Regular"],"text-size":11},"paint":{"text-color":"\(labels)","text-halo-color":"\(bg)","text-halo-width":1.3}},
    {"id":"place-labels","type":"symbol","source":"streets","source-layer":"place_label","layout":{"text-field":["get","name"],"text-font":["DIN Pro Medium","Arial Unicode MS Regular"],"text-size":13},"paint":{"text-color":"\(labels)","text-halo-color":"\(bg)","text-halo-width":1.2}}
    ]}
    """
  }
}
