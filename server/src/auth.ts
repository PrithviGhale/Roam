import { timingSafeEqual } from "node:crypto";
import { RequestError } from "./http";
export interface AuthIdentity {
  kind: "development" | "prototype" | "user";
  rateKey: string;
}
export type UserTokenVerifier = (
  token: string,
) => Promise<{ subject: string } | null>;
export function localHost(host: string): boolean {
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  return (
    parts.every((n) => n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31))
  );
}
async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
export async function authorize(
  request: Request,
  config: { ROAM_ACCESS_TOKEN?: string; AUTH_MODE?: string },
  verifyUser?: UserTokenVerifier,
): Promise<AuthIdentity> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([A-Za-z0-9._~+\/-]{1,300})$/i);
  if (header !== null && !match)
    throw new RequestError(401, "Malformed authorization header.");
  const token = match?.[1];
  if (config.AUTH_MODE === "user") {
    if (!verifyUser)
      throw new RequestError(503, "User authentication is not configured.");
    const identity = token ? await verifyUser(token) : null;
    if (!identity || !identity.subject || identity.subject.length > 200)
      throw new RequestError(401, "ROAM access was rejected.");
    const hash = await digest(identity.subject);
    return {
      kind: "user",
      rateKey: `user:${Array.from(hash, (n) => n.toString(16).padStart(2, "0")).join("")}`,
    };
  }
  if (config.AUTH_MODE && config.AUTH_MODE !== "prototype")
    throw new RequestError(503, "Backend authentication mode is invalid.");
  if (config.ROAM_ACCESS_TOKEN) {
    if (
      !token ||
      !timingSafeEqual(
        await digest(token),
        await digest(config.ROAM_ACCESS_TOKEN),
      )
    )
      throw new RequestError(401, "ROAM access was rejected.");
    return { kind: "prototype", rateKey: "prototype" };
  }
  if (token || !localHost(new URL(request.url).hostname))
    throw new RequestError(
      503,
      "Configure backend access protection before publishing.",
    );
  return { kind: "development", rateKey: "local-development" };
}
