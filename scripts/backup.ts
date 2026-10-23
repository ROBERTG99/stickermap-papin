/**
 * Local copy of the data on this Mac (BUILD.md §13): a D1 dump, and the photo mirror through rclone when it is installed.
 *
 *   npx tsx scripts/backup.ts --dest "$PAPIN_DRIVE/backups" [--photos]
 */
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";

const run = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const dest = arg("--dest");
if (!dest) throw new Error('--dest "<folder>" is required');

const stamp = new Date().toISOString().slice(0, 10);
await mkdir(join(dest, "d1"), { recursive: true });
await run("npx", ["wrangler", "d1", "export", "stickermap", "--remote", "--output", "build/backup.sql"], { maxBuffer: 256 * 1024 * 1024 });
await writeFile(join(dest, "d1", `d1-${stamp}.sql.gz`), gzipSync(await readFile("build/backup.sql")));
console.log(`D1 dump -> ${join(dest, "d1", `d1-${stamp}.sql.gz`)}`);

if (process.argv.includes("--photos")) {
  // add-only mirror: never overwrites or deletes (photo keys are never reused)
  await run("rclone", ["copy", "r2:stickermap-photos", join(dest, "photos"), "--immutable", "--exclude", "backups/**"]);
  console.log(`photos mirrored -> ${join(dest, "photos")}`);
}
