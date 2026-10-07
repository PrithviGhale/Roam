const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

module.exports = function withRoamWakeWord(config) {
  return withXcodeProject(config, (mod) => {
    const source = path.join(
      mod.modRequest.projectRoot,
      "assets",
      "wake",
      "hey-roam_ios.ppn",
    );
    if (!fs.existsSync(source)) return mod;
    const projectName = mod.modRequest.projectName;
    const target = path.join(
      mod.modRequest.platformProjectRoot,
      projectName,
      "hey-roam_ios.ppn",
    );
    fs.copyFileSync(source, target);
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: `${projectName}/hey-roam_ios.ppn`,
      groupName: projectName,
      project: mod.modResults,
      isBuildFile: true,
    });
    return mod;
  });
};
