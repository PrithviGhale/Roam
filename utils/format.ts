export function formatDistance(meters: number | null | undefined): string {
  if (
    meters === null ||
    meters === undefined ||
    !Number.isFinite(meters) ||
    meters < 0
  )
    return "—";
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round((meters * 3.28084) / 10) * 10} ft`;
  return `${miles < 100 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
export function formatDuration(seconds: number | null | undefined): string {
  if (
    seconds === null ||
    seconds === undefined ||
    !Number.isFinite(seconds) ||
    seconds < 0
  )
    return "—";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}
export function formatArrival(seconds: number, now = Date.now()): string {
  return new Date(now + seconds * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
