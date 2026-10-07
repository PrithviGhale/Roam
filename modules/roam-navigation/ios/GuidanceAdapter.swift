import GoogleNavigation

enum GuidanceAdapter {
  // Raw values are confined to this adapter; verified against the 11.2.0 headers.
  static func maneuver(_ value: GMSNavigationManeuver) -> String {
    switch value.rawValue {
    case 2...4: return "arrive"
    case 1, 5, 65: return "straight"
    case 6: return "left"
    case 7: return "right"
    case 8, 19, 24: return "forkLeft"
    case 9, 20, 25: return "forkRight"
    case 10, 26: return "slightLeft"
    case 11, 27: return "slightRight"
    case 12, 28: return "sharpLeft"
    case 13, 29: return "sharpRight"
    case 14, 15, 30, 31, 41, 42: return "uTurn"
    case 16...18, 21...23: return "merge"
    case 33, 35, 37, 39: return "exitLeft"
    case 34, 36, 38, 40: return "exitRight"
    case 43...62: return "roundabout"
    default: return "unknown"
    }
  }
  static func step(_ step: GMSNavigationStepInfo) -> [String: Any] {
    var result: [String: Any] = ["maneuver": maneuver(step.maneuver), "instruction": step.fullInstructionText,
      "roadName": step.fullRoadName, "step": step.stepNumber]
    if let exit = step.exitNumber, !exit.isEmpty { result["exitNumber"] = exit }
    if step.roundaboutTurnNumber > 0 { result["roundaboutExit"] = step.roundaboutTurnNumber }
    return result
  }
  static func guidance(_ info: GMSNavigationNavInfo) -> [String: Any]? {
    guard let current = info.currentStep, info.navState == .enroute else { return nil }
    var result = step(current)
    result["distanceToManeuverMeters"] = info.distanceToCurrentStepMeters
    result["remainingDistanceMeters"] = info.distanceToFinalDestinationMeters
    result["remainingDurationSeconds"] = info.timeToFinalDestinationSeconds
    if let next = info.remainingSteps.first { result["next"] = step(next) }
    return result
  }
}
