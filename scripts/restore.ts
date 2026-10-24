/**
 * Restore a D1 dump (`d1-YYYY-MM-DD.sql[.gz]`, see the nightly backup) into an EMPTY database.
 *
 *   npx wrangler d1 create stickermap-scratch
 *   npx tsx scripts/restore.ts --file d1-2026-10-24.sql.gz --db stickermap-scratch --target remote
 *
 * D1 rejects a raw `wrangler d1 export` file when it is run as one script (`D1_RESET_DO`), so the dump is split: the schema
 * statements run one by one, then all the data in a single file. Lines D1 does not accept are dropped (PRAGMA, sqlite_sequence).
 * Restore into a SCRATCH database first and check it; to restore production itself pass `--db stickermap`
 * `--i-know-this-overwrites-production` (the database must be empty). For "undo the last few days" use D1 Time Travel instead:
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
const statements = sql.split(/;\n(?=(?:INSERT INTO|CREATE |PRAGMA |DELETE |DROP ))/).map((s) => s.trim()).filter(Boolean);
const accepted = (s: string) => !/^PRAGMA /i.test(s) && !/^DELETE FROM sqlite_sequence/i.test(s) && !/^INSERT INTO "?sqlite_sequence"?/i.test(s);
const withSemicolon = (s: string) => (s.endsWith(";") ? s : `${s};`);
const schema = statements.filter((s) => accepted(s) && !s.startsWith("INSERT INTO"));
const data = statements.filter((s) => accepted(s) && s.startsWith("INSERT INTO"));

await mkdir("build", { recursive: true });
const exec = (args: string[]) => run("npx", ["wrangler", "d1", "execute", db, where, ...args, "--yes"], { maxBuffer: 256 * 1024 * 1024 });
for (const [i, statement] of schema.entries()) {
  await writeFile("build/restore-step.sql", withSemicolon(statement));
  await exec(["--file", "build/restore-step.sql"]);
  if ((i + 1) % 5 === 0 || i + 1 === schema.length) console.log(`schema ${i + 1}/${schema.length}`);
}
await writeFile("build/restore-data.sql", data.map(withSemicolon).join("\n") + "\n");
await exec(["--file", "build/restore-data.sql"]);

const { stdout } = await exec(["--json", "--command", "SELECT (SELECT COUNT(*) FROM spots) AS spots, (SELECT COUNT(*) FROM people) AS people, (SELECT COUNT(*) FROM sticker_types) AS types, (SELECT COUNT(*) FROM spot_types) AS spot_types"]);
console.log(`restored ${data.length} rows into ${db}:`, JSON.stringify((JSON.parse(stdout.slice(stdout.indexOf("["))) as { results: unknown[] }[])[0]?.results[0]));
