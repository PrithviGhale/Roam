import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Stable 3.32.0 uses public binary downloads. Optional authentication supports
// older/snapshot packages. This credential never enters the app configuration.
if (
  process.platform === "darwin" &&
  process.env.EAS_BUILD_PLATFORM !== "android"
) {
  const token = process.env.MAPBOX_DOWNLOADS_TOKEN?.trim();
  if (token) {
    if (!/^sk\.[A-Za-z0-9._-]+$/.test(token))
      throw new Error("Invalid build-only Mapbox download token format.");
    const path = join(homedir(), ".netrc");
    const existing = await readFile(path, "utf8").catch(() => "");
    if (!/machine\s+api\.mapbox\.com\b/.test(existing)) {
      await writeFile(
        path,
        `${existing}\nmachine api.mapbox.com\nlogin mapbox\npassword ${token}\n`,
        { mode: 0o600 },
      );
      await chmod(path, 0o600);
    }
  }
  console.log(
    "Mapbox resolves through React Native SPM during the iOS build. Google Navigation remains excluded.",
  );
} else {
  console.log(
    "Mapbox native dependency resolution requires macOS/EAS; no Swift compilation on this host.",
  );
}
