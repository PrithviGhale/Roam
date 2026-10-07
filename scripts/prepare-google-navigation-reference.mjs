import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, cp, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Mirrors Google's official SwiftPM 11.2.0 binary URLs/checksums. CocoaPods links
// these binaries into the local Expo module; no deprecated GoogleMaps 9.x pod.
const root = resolve(import.meta.dirname, "..");
const vendor = join(root, "modules/roam-navigation/ios/vendor");
const cache = join(root, ".native-cache/build");
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export async function prepare() {
  if (
    process.platform !== "darwin" ||
    process.env.EAS_BUILD_PLATFORM === "android"
  ) {
    console.log(
      "Google native preparation runs on macOS/EAS. Windows checks do not compile Swift.",
    );
    return;
  }
  if (await exists(join(vendor, ".version-11.2.0"))) return;
  await mkdir(cache, { recursive: true });
  await mkdir(vendor, { recursive: true });
  for (const [name, hash] of [
    [
      "GoogleMaps",
      "3678d0581cfbdf4dc84546bc55b11defb21ba517656a0fb1cd845d68d01ea4f3",
    ],
    [
      "GoogleNavigation",
      "d2ad20c8f06cdb610dab669d8c7ce3c38f34fc3ddcbce22e189bb87baf1cb192",
    ],
  ]) {
    const zip = join(cache, `${name}.zip`);
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "3",
        "--max-time",
        "180",
        "-o",
        zip,
        `https://dl.google.com/geosdk/swiftpm/11.2.0/${name}_3p.xcframework.zip`,
      ],
      { stdio: "inherit" },
    );
    if (
      createHash("sha256")
        .update(await readFile(zip))
        .digest("hex") !== hash
    )
      throw new Error(`${name} checksum mismatch`);
    execFileSync("ditto", ["-x", "-k", zip, vendor]);
    const repo = name === "GoogleMaps" ? "ios-maps-sdk" : "ios-navigation-sdk";
    const archive = join(cache, `${repo}.zip`),
      extracted = join(cache, repo);
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "3",
        "--max-time",
        "180",
        "-o",
        archive,
        `https://codeload.github.com/googlemaps/${repo}/zip/refs/tags/11.2.0`,
      ],
      { stdio: "inherit" },
    );
    const resourceHash =
      name === "GoogleMaps"
        ? "43c69953d2a36fc9032654f31cf003d2a653fbc121d6643368846f28fd30731a"
        : "31e43f547141c6c360250b69c180f3ead80408ae3fb041c7964fc9504e5cbf22";
    if (
      createHash("sha256")
        .update(await readFile(archive))
        .digest("hex") !== resourceHash
    )
      throw new Error(`${name} resource checksum mismatch`);
    await mkdir(extracted, { recursive: true });
    execFileSync("ditto", ["-x", "-k", archive, extracted]);
    const section = name === "GoogleMaps" ? "Maps" : "Navigation";
    await cp(
      join(
        extracted,
        `${repo}-11.2.0`,
        section,
        "Resources",
        `${name}Resources`,
        `${name}.bundle`,
      ),
      join(vendor, `${name}.bundle`),
      { recursive: true },
    );
  }
  await writeFile(join(vendor, ".version-11.2.0"), "11.2.0\n");
  console.log(
    "Official Google Maps + Navigation 11.2.0 binaries/resources prepared.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  await prepare();
