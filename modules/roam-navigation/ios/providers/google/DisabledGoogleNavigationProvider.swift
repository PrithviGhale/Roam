import Foundation

/// Retains the provider contract without linking or initializing Google's SDK.
/// The original V0.7 sources beside this file are reference-only, not pod sources.
@MainActor
final class DisabledGoogleNavigationProvider: RoamNavigationProvider {
  var emit: (([String: Any]) -> Void)?
  func availability() -> [String: Any] { ["available": false, "provider": "google", "reason": "unsupported-for-this-project", "version": "11.2.0"] }
  func start(_ session: String, _ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void) { completion(false) }
  func replace(_ points: [RoamWaypoint], routeID: String?, completion: @escaping (Bool) -> Void) { completion(false) }
  func continueTrip(completion: @escaping (Bool) -> Void) { completion(false) }
  func stop() {}
  func simulate(_ enabled: Bool) {}
}
