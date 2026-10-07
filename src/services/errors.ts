export type ErrorCode =
  | "configuration"
  | "network"
  | "timeout"
  | "permission"
  | "quota"
  | "invalid-data"
  | "no-route"
  | "location"
  | "cancelled";
export class ServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export function isCancelled(error: unknown): boolean {
  return (
    (error instanceof ServiceError && error.code === "cancelled") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
export function errorMessage(error: unknown): string {
  return error instanceof ServiceError
    ? error.message
    : "Something went wrong. Please try again.";
}
