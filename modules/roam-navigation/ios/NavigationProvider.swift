import ExpoModulesCore
import CoreLocation

struct RoamWaypoint: Record {
  @Field var id: String = ""
  @Field var name: String = ""
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}

@MainActor
protocol RoamNavigationProvider: AnyObject {
  var emit: (([String: Any]) -> Void)? { get set }
  func availability() -> [String: Any]
  func start(_ session: String, _ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void)
  func replace(_ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void)
  func continueTrip(completion: @escaping (Bool) -> Void)
  func stop()
  func simulate(_ enabled: Bool)
}

// V0.7's Google implementation is kept under providers/google, excluded from
// pod sources/dependencies. It cannot be selected or initialized.
enum NavigationProviderRegistry {
  @MainActor static var selected: MapboxRoamProvider { .shared }
  static let googleSupported = false
}
