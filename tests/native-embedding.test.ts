import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/package.json`);
const { embedMapboxFrameworks } = require("./plugins/withRoamNavigation.js");
const xcode = require("xcode");
const parser = require("xcode/lib/parser/pbxproj");

test("repeated prebuild embeds the three dynamic SDK frameworks once without linking static Core twice", () => {
  const project = xcode.project("ROAM.xcodeproj/project.pbxproj");
  project.hash = {
    project: {
      archiveVersion: 1,
      classes: {},
      objectVersion: 56,
      rootObject: "ROOT",
      objects: {
        PBXProject: {
          ROOT: {
            isa: "PBXProject",
            targets: [{ value: "APP", comment: "ROAM" }],
          },
          ROOT_comment: "Project object",
        },
        PBXNativeTarget: {
          APP: {
            isa: "PBXNativeTarget",
            name: "ROAM",
            buildPhases: [],
            productType: '"com.apple.product-type.application"',
          },
          APP_comment: "ROAM",
        },
        PBXFileReference: {},
        PBXBuildFile: {},
      },
    },
  };
  embedMapboxFrameworks(project);
  const first = project.writeSync();
  embedMapboxFrameworks(project);
  assert.equal(project.writeSync(), first);
  const parsed = parser.parse(first).project.objects;
  assert.equal(parsed.PBXNativeTarget.APP.buildPhases.length, 1);
  const phaseID = parsed.PBXNativeTarget.APP.buildPhases[0].value;
  const phase = parsed.PBXShellScriptBuildPhase[phaseID];
  assert.equal(phase.outputPaths.length, 3);
  for (const framework of [
    "MapboxCommon",
    "MapboxCoreMaps",
    "MapboxNavigationNative",
  ])
    assert.ok(
      phase.outputPaths.some((value: string) =>
        value.includes(`${framework}.framework`),
      ),
    );
  assert.ok(!first.includes("MapboxNavigationCore"));
  assert.match(phase.shellScript, /codesign/);
  assert.match(phase.shellScript, /Missing Mapbox runtime framework/);
});
