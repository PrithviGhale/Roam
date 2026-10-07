import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marker = "# ROAM: RN 0.86 prebuilt dependency compatibility";
export function patchVoiceProcessor(source) {
  if (source.includes(marker)) return source;
  const block =
    /  # Don't install the dependencies when we run `pod install` in the old architecture\.[\s\S]*?\n  end\nend\s*$/;
  if (!block.test(source))
    throw new Error(
      "Voice processor podspec changed; review the RN compatibility patch.",
    );
  return source.replace(
    block,
    `  ${marker}\n  install_modules_dependencies(s)\nend\n`,
  );
}

async function main() {
  const path = resolve(
    "node_modules/@picovoice/react-native-voice-processor/react-native-voice-processor.podspec",
  );
  const manifest = JSON.parse(
    await readFile(
      resolve(
        "node_modules/@picovoice/react-native-voice-processor/package.json",
      ),
      "utf8",
    ),
  );
  if (manifest.version !== "1.2.3")
    throw new Error(
      "Review voice processor compatibility before changing its pinned version.",
    );
  const source = await readFile(path, "utf8");
  const patched = patchVoiceProcessor(source);
  if (patched !== source) await writeFile(path, patched);
  console.log(
    "Picovoice voice processor uses React Native's current pod dependency helper.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
