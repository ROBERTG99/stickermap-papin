/**
 * Free R2 space when the storage meter gets tight (BUILD.md §4.1): move `orig/` to the Google Drive mirror and delete it
 * from R2. Originals are never served publicly, so nothing in the app changes (the admin "descargar original" then reads 404).
 *
 *   npx tsx scripts/offload-originals.ts --drive "gdrive:<backup folder>/photos" [--yes]
 *
 * Needs rclone with an `r2:` remote (S3 endpoint of the account) and the Drive remote. Dry run unless --yes: it first copies
 * add-only, then verifies with `rclone check`, and only then deletes from R2 and lowers the meter.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const drive = arg("--drive");
const yes = process.argv.includes("--yes");
if (!drive) throw new Error('--drive "<rclone remote:path>" is required');

const sh = async (cmd: string, args: string[]) => (await run(cmd, args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
const size = JSON.parse(await sh("rclone", ["size", "r2:stickermap-photos/orig", "--json"])) as { count: number; bytes: number };
console.log(`orig/ holds ${size.count} objects, ${(size.bytes / 1024 ** 2).toFixed(1)} MiB`);
if (!yes) { console.log("dry run: pass --yes to copy, verify and delete"); process.exit(0); }

await sh("rclone", ["copy", "r2:stickermap-photos/orig", `${drive}/orig`, "--immutable"]);
await sh("rclone", ["check", "r2:stickermap-photos/orig", `${drive}/orig`, "--one-way"]); // throws when anything differs or is missing
await sh("rclone", ["delete", "r2:stickermap-photos/orig"]);
await sh("npx", ["wrangler", "d1", "execute", "stickermap", "--remote", "--command",
  `UPDATE settings SET value = CAST(MAX(0, CAST(value AS INTEGER) - ${size.bytes}) AS TEXT) WHERE key = 'r2_bytes'`]);
console.log(`offloaded ${size.count} originals (${(size.bytes / 1024 ** 2).toFixed(1)} MiB) and lowered the meter`);
