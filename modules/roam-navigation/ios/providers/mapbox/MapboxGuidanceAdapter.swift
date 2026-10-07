import MapboxDirections
import MapboxNavigationCore

enum MapboxGuidanceAdapter {
  static func maneuver(_ step: RouteStep) -> String {
    let type = step.maneuverType.rawValue
    let direction = step.maneuverDirection?.rawValue ?? ""
    if type == "arrive" { return "arrive" }
    if ["roundabout", "rotary", "roundabout turn", "exit roundabout", "exit rotary"].contains(type) { return "roundabout" }
    if type == "merge" || type == "on ramp" { return "merge" }
    if type == "off ramp" { return direction.contains("left") ? "exitLeft" : direction.contains("right") ? "exitRight" : "unknown" }
    if type == "fork" { return direction.contains("left") ? "forkLeft" : direction.contains("right") ? "forkRight" : direction == "straight" ? "straight" : "unknown" }
    switch direction {
    case "straight": return "straight"
    case "slight left": return "slightLeft"
    case "left": return "left"
    case "sharp left": return "sharpLeft"
    case "slight right": return "slightRight"
    case "right": return "right"
    case "sharp right": return "sharpRight"
    case "uturn": return "uTurn"
    default: return ["depart", "continue", "new name"].contains(type) ? "straight" : "unknown"
    }
  }
  static func step(_ value: RouteStep, index: Int) -> [String: Any] {
    var data: [String: Any] = ["maneuver": maneuver(value), "instruction": String(value.instructions.prefix(1000)), "roadName": String((value.names?.joined(separator: " / ") ?? "").prefix(300)), "step": index]
    if let exit = value.exitCodes?.first { data["exitNumber"] = String(exit.prefix(100)) }
    if maneuver(value) == "roundabout", let exit = value.exitIndex, exit > 0 { data["roundaboutExit"] = exit }
    return data
  }
  static func guidance(_ progress: RouteProgress) -> [String: Any]? {
    let leg = progress.currentLegProgress
    let target = leg.upcomingStep ?? leg.currentStep
    var data = step(target, index: leg.stepIndex + (leg.upcomingStep == nil ? 0 : 1))
    let values = [leg.currentStepProgress.distanceRemaining, progress.distanceRemaining, progress.durationRemaining, progress.distanceTraveled, progress.fractionTraveled]
    guard values.allSatisfy({ $0.isFinite && $0 >= 0 }), progress.fractionTraveled <= 1 else { return nil }
    data["distanceToManeuverMeters"] = leg.currentStepProgress.distanceRemaining
    data["remainingDistanceMeters"] = progress.distanceRemaining
    data["remainingDurationSeconds"] = progress.durationRemaining
    data["distanceTraveledMeters"] = progress.distanceTraveled
    data["fractionTraveled"] = progress.fractionTraveled
    data["leg"] = progress.legIndex
    if let following = leg.followOnStep { data["next"] = step(following, index: leg.stepIndex + 2) }
    return data
  }
}
