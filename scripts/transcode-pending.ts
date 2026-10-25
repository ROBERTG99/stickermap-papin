/**
 * Convert the videos a browser could not convert (spots flagged `video_needs_transcode`, BUILD.md §19 F1) to H.264 MP4 with ffmpeg.
 *
 *   npx tsx scripts/transcode-pending.ts [--dry-run]
 *
 * Needs ffmpeg on the PATH, `wrangler login`, and the same local `.deploy.env` as scripts/deploy.ts (D1_DATABASE_ID).
 * For each pending spot: download `video/<id>.mov`, trim to 15 s, long edge 1280, ~2.5 Mbps, AAC 96k, no metadata ->
 * `video/<id>.mp4`, then point the spot at it, clear the flag and delete the original upload.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".deploy.env")) {
  for (const line of readFileSync(".deploy.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
const dryRun = process.argv.includes("--dry-run");
const databaseId = process.env.D1_DATABASE_ID;
if (!databaseId) throw new Error("D1_DATABASE_ID is not set (environment variable or .deploy.env)");
const BUCKET = "stickermap-photos";

const base = JSON.parse(readFileSync("dist/stickermap/wrangler.json", "utf8")) as { d1_databases: { database_id: string }[] };
base.d1_databases[0]!.database_id = databaseId;
const config = "dist/stickermap/wrangler.transcode.generated.json";
writeFileSync(config, JSON.stringify(base));

const wrangler = (...args: string[]) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 });
const sql = (command: string) => wrangler("d1", "execute", "stickermap", "--remote", "-c", config, "--json", "--command", command);

const out = JSON.parse(sql("SELECT id, video_key, video_duration_ms FROM spots WHERE video_needs_transcode = 1 AND video_key IS NOT NULL")) as { results: { id: string; video_key: string }[] }[];
const pending = out[0]?.results ?? [];
console.log(`${pending.length} video(s) to convert${dryRun ? " (dry run)" : ""}`);

const dir = join("build", "transcode");
mkdirSync(dir, { recursive: true });
for (const { id, video_key } of pending) {
  const input = join(dir, `${id}.src`);
  const output = join(dir, `${id}.mp4`);
  console.log(`- ${id}  ${video_key}`);
  if (dryRun) continue;
  wrangler("r2", "object", "get", `${BUCKET}/${video_key}`, "--remote", "-c", config, "--file", input);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input, "-t", "15", "-map_metadata", "-1",
    "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',fps='min(30,source_fps)'",
    "-c:v", "libx264", "-b:v", "2500k", "-maxrate", "3000k", "-bufsize", "5000k", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "96k", output,
  ]);
  const bytes = statSync(output).size;
  const newKey = `video/${id}.mp4`;
  wrangler("r2", "object", "put", `${BUCKET}/${newKey}`, "--remote", "-c", config, "--file", output, "--content-type", "video/mp4");
  sql(`UPDATE spots SET video_key = '${newKey}', video_bytes = ${bytes}, video_needs_transcode = 0, needs_review = 0, review_reason = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = '${id}'`);
  if (video_key !== newKey) wrangler("r2", "object", "delete", `${BUCKET}/${video_key}`, "--remote", "-c", config);
  console.log(`  -> ${newKey} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}
