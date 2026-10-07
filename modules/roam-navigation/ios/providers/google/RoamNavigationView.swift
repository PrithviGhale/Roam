import ExpoModulesCore
import GoogleMaps
import GoogleNavigation
import CoreLocation

final class RoamNavigationView: ExpoView, GMSMapViewDelegate {
  let onCameraChange = EventDispatcher()
  var cameraMode = "OVERVIEW"
  var recenter = 0
  var topInset: Double = 120
  var bottomInset: Double = 180
  private var map: GMSMapView?
  private var line: GMSPolyline?
  private var marker: GMSMarker?
  private var pointerIcon: UIImage?
  private var dotIcon: UIImage?
  private var lastFix: CLLocation?
  private var lastGeometry = ""
  private var waypoints: [GMSMarker] = []
  func destinations(_ points: [RoamWaypoint]) {
    waypoints.forEach { $0.map = nil }; waypoints = points.map { point in
      let marker = GMSMarker(position: CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude))
      marker.title = point.name; marker.map = map; return marker
    }
  }
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    guard NavigationCoordinator.shared.configureMaps() else { return }
    let options = GMSMapViewOptions()
    let map = GMSMapView(options: options)
    self.map = map; addSubview(map)
    map.delegate = self; map.settings.compassButton = true
    map.settings.myLocationButton = false
    // Plain Google map, custom route/marker, no Google navigation header/footer.
    NavigationCoordinator.shared.view = self
    attach(NavigationCoordinator.shared.session)
  }
  override func layoutSubviews() { super.layoutSubviews(); map?.frame = bounds; updatePadding(); updateCamera() }
  func updatePadding() { map?.padding = UIEdgeInsets(top: topInset, left: 20, bottom: bottomInset, right: 20) }
  func attach(_ session: GMSNavigationSession?) {
    map?.roadSnappedMyLocationSource = session?.roadSnappedLocationProvider
    map?.isMyLocationEnabled = false
  }
  func route(_ points: [[String: Double]]) {
    guard let map else { return }
    if points.isEmpty { line?.map = nil; line = nil; lastGeometry = ""; return }
    let path = GMSMutablePath()
    for point in points { if let lat = point["latitude"], let lng = point["longitude"] { path.add(CLLocationCoordinate2D(latitude: lat, longitude: lng)) } }
    let identity = path.encodedPath()
    guard identity != lastGeometry else { return }; lastGeometry = identity
    line?.map = nil
    let polyline = GMSPolyline(path: path)
    polyline.strokeWidth = 6; polyline.strokeColor = UIColor(red: 0.70, green: 0.40, blue: 0.18, alpha: 1); polyline.map = map; line = polyline
    if cameraMode == "OVERVIEW" { updateCamera() }
  }
  func rawFix(_ value: [String: Double]?) {
    guard NavigationCoordinator.shared.session == nil, let value, let lat = value["latitude"], let lng = value["longitude"] else { return }
    fix(CLLocation(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng), altitude: 0, horizontalAccuracy: -1, verticalAccuracy: -1, course: value["heading"] ?? -1, speed: -1, timestamp: Date()))
  }
  func fix(_ location: CLLocation) {
    lastFix = location
    if marker == nil {
      let marker = GMSMarker(); marker.groundAnchor = CGPoint(x: 0.5, y: 0.5); marker.isFlat = true
      marker.icon = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 48)).image { _ in
        let shape = UIBezierPath(); shape.move(to: CGPoint(x: 20, y: 3)); shape.addLine(to: CGPoint(x: 36, y: 40))
        shape.addLine(to: CGPoint(x: 20, y: 32)); shape.addLine(to: CGPoint(x: 4, y: 40)); shape.close()
        UIColor.white.setStroke(); shape.lineWidth = 4; shape.stroke()
        UIColor(red: 0.70, green: 0.40, blue: 0.18, alpha: 1).setFill(); shape.fill()
      }
      pointerIcon = marker.icon
      dotIcon = UIGraphicsImageRenderer(size: CGSize(width: 28, height: 28)).image { _ in
        let circle = UIBezierPath(ovalIn: CGRect(x: 4, y: 4, width: 20, height: 20))
        UIColor.white.setStroke(); circle.lineWidth = 4; circle.stroke()
        UIColor(red: 0.70, green: 0.40, blue: 0.18, alpha: 1).setFill(); circle.fill()
      }
      marker.map = map; self.marker = marker
    }
    marker?.position = location.coordinate
    marker?.icon = location.course >= 0 ? pointerIcon : dotIcon
    if location.course >= 0 { marker?.rotation = location.course }
    updateCamera()
  }
  func updateCamera() {
    guard let map, bounds.width > 0, bounds.height > 0 else { return }
    if cameraMode == "OVERVIEW", let path = line?.path, path.count() > 1 {
      map.moveCamera(GMSCameraUpdate.fit(GMSCoordinateBounds(path: path), withPadding: 30)); return
    }
    guard (cameraMode == "FOLLOW" || cameraMode == "OVERVIEW" && line == nil), let fix = lastFix else { return }
    map.moveCamera(GMSCameraUpdate.setCamera(GMSCameraPosition(target: fix.coordinate, zoom: 17, bearing: fix.course >= 0 ? fix.course : 0, viewingAngle: fix.speed > 8 ? 25 : 0)))
  }
  func mapView(_ mapView: GMSMapView, willMove gesture: Bool) {
    if gesture { cameraMode = "FREE"; onCameraChange(["mode": "FREE"]) }
  }
}
