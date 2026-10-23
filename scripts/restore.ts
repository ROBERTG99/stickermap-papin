/**
 * Restore a D1 dump (`d1-YYYY-MM-DD.sql[.gz]`, see the nightly backup) into a database.
 *
 *   npx tsx scripts/restore.ts --file d1-2026-10-24.sql.gz --db stickermap-scratch --target remote
 *
 * Restore into a SCRATCH database first (`wrangler d1 create stickermap-scratch`) and check it; to restore production
 * itself pass `--db stickermap --i-know-this-overwrites-production`. For "undo the last few days" use D1 Time Travel instead:
 * `wrangler d1 time-travel restore stickermap --timestamp=<ISO>`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const run = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const file = arg("--file");
const db = arg("--db") ?? "stickermap-scratch";
const where = arg("--target") === "remote" ? "--remote" : "--local";
if (!file) throw new Error("--file <dump.sql[.gz]> is required");
if (db === "stickermap" && !process.argv.includes("--i-know-this-overwrites-production")) {
  throw new Error("refusing to restore into production without --i-know-this-overwrites-production (use a scratch database first)");
}
const raw = await readFile(file);
const sql = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
await mkdir("build", { recursive: true });
await writeFile("build/restore.sql", sql);
await run("npx", ["wrangler", "d1", "execute", db, where, "--file", "build/restore.sql", "--yes"], { maxBuffer: 256 * 1024 * 1024 });
const { stdout } = await run("npx", ["wrangler", "d1", "execute", db, where, "--json", "--command", "SELECT (SELECT COUNT(*) FROM spots) AS spots, (SELECT COUNT(*) FROM people) AS people, (SELECT COUNT(*) FROM sticker_types) AS types"]);
console.log(`restored into ${db}:`, JSON.stringify((JSON.parse(stdout.slice(stdout.indexOf("["))) as { results: unknown[] }[])[0]?.results[0]));
