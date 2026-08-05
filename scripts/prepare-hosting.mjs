import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(projectRoot, "hosting-dist");
const publicEntries = [
  "index.html",
  "tv.html",
  "nchm.css",
  "tv.css",
  "tv-admin.css",
  "js",
  "assets"
];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const entry of publicEntries) {
  cpSync(join(projectRoot, entry), join(outputDir, entry), { recursive: true });
}

console.log(`Prepared ${publicEntries.length} public entries in hosting-dist.`);
