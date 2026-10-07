import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json"));
const plugin = require("./plugins/withRoamWakeWord.js");
async function bundle(withModel: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), "roam-wake-plugin-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  try {
    mkdirSync(path.join(root, "assets/wake"), { recursive: true });
    mkdirSync(path.join(root, "ios/ROAM"), { recursive: true });
    if (withModel)
      writeFileSync(
        path.join(root, "assets/wake/hey-roam_ios.ppn"),
        "TEST FIXTURE ONLY",
      );
    const files: string[] = [],
      resources: string[] = [];
    const groups = {
      root: { children: [{ value: "app", comment: "ROAM" }] },
      app: { children: [] as { value: string; comment: string }[] },
    };
    let serial = 0;
    const project = {
      getFirstProject: () => ({ firstProject: { mainGroup: "root" } }),
      getPBXGroupByKey: (key: keyof typeof groups) => groups[key],
      getTarget: () => ({ uuid: "application-target" }),
      generateUuid: () => String(++serial),
      addToPbxFileReferenceSection: (file: { path: string }) =>
        files.push(file.path),
      addToPbxBuildFileSection: () => {},
      addToPbxResourcesBuildPhase: (file: { path: string }) =>
        resources.push(file.path),
    };
    const config = plugin({ name: "ROAM", slug: "roam" });
    const input = {
      ...config,
      modResults: project,
      modRequest: {
        projectRoot: root,
        platformProjectRoot: path.join(root, "ios"),
        projectName: "ROAM",
        platform: "ios",
        modName: "xcodeproj",
        introspect: false,
      },
    };
    await config.mods.ios.xcodeproj(input);
    await config.mods.ios.xcodeproj(input);
    return {
      files,
      resources,
      copied: withModel
        ? readFileSync(path.join(root, "ios/ROAM/hey-roam_ios.ppn"), "utf8")
        : null,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("optional wake model does not break a native build when absent", async () => {
  const result = await bundle(false);
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.resources, []);
});
test("local model is copied and linked once into the iOS resource build phase", async () => {
  const result = await bundle(true);
  assert.equal(result.copied, "TEST FIXTURE ONLY");
  assert.equal(result.files.length, 1);
  assert.equal(result.resources.length, 1);
  assert.match(result.resources[0]!, /ROAM\/hey-roam_ios.ppn/);
});
