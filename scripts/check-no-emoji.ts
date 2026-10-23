/** Design rule: no emoji anywhere in the UI (icons + words; flags are SVG). Fails the build on any emoji code point. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["src", "worker"];
const SKIP = new Set(["flags", "node_modules", "icons.generated.ts"]);
// Extended pictographic + regional-indicator flags + keycaps + variation selector 16 (emoji presentation)
// (c) (R) (TM) are text symbols that Unicode also marks pictographic: the map attribution needs "(c)".
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|️|⃣/u;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css|json|html|webmanifest|js)$/.test(e.name)) yield p;
  }
}

let bad = 0;
for (const root of ROOTS) {
  for await (const file of walk(root)) {
    (await readFile(file, "utf8")).split("\n").forEach((line, i) => {
      const m = EMOJI.exec(line);
      if (m) { bad++; console.error(`${file}:${i + 1}: emoji U+${m[0].codePointAt(0)!.toString(16).toUpperCase()}`); }
    });
  }
}
if (bad) { console.error(`${bad} emoji found (design system: no emoji in the UI)`); process.exit(1); }
console.log("no emoji found");
