import { writeFileSync, mkdirSync } from "node:fs";
import { buildMapTheme } from "../src/map/themes";
const directory = "modules/roam-navigation/ios/map/themes";
mkdirSync(directory, { recursive: true });
for (const theme of ["night", "day"] as const) writeFileSync(`${directory}/roam-${theme}.json`, JSON.stringify(buildMapTheme(theme), null, 2) + "\n");
