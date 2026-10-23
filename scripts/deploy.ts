/**
 * Deploy helper that keeps every account-specific value out of the repository.
 *
 *   npx tsx scripts/deploy.ts migrate|public|admin
 *
 * Values come from the environment (GitHub Actions variables in CI) or from a local, git-ignored `.deploy.env`:
 *   D1_DATABASE_ID, CONTACT_EMAIL, ADMIN_ORIGIN (public Worker), ACCESS_TEAM_DOMAIN + ACCESS_AUD (admin Worker).
 * It patches the config produced by `npm run build` (dist/stickermap/wrangler.json) and runs wrangler with it.
 * The admin Worker is the same build under another name, without the cron trigger, behind Cloudflare Access.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".deploy.env")) {
  for (const line of readFileSync(".deploy.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (environment variable or .deploy.env)`);
  return v;
};

const target = process.argv[2];
if (target !== "migrate" && target !== "public" && target !== "admin") throw new Error("usage: deploy.ts migrate|public|admin");

const base = JSON.parse(readFileSync("dist/stickermap/wrangler.json", "utf8")) as {
  vars: Record<string, string>;
  d1_databases: { database_id: string }[];
  triggers?: { crons: string[] };
  name: string;
};
base.d1_databases[0]!.database_id = need("D1_DATABASE_ID");

const config = { ...base, vars: { ...base.vars, CONTACT_EMAIL: need("CONTACT_EMAIL") } };
if (target === "admin") {
  Object.assign(config, { name: "stickermap-admin", triggers: { crons: [] } });
  Object.assign(config.vars, { ADMIN_ORIGIN: "", ACCESS_TEAM_DOMAIN: need("ACCESS_TEAM_DOMAIN"), ACCESS_AUD: need("ACCESS_AUD") });
} else {
  Object.assign(config.vars, { ADMIN_ORIGIN: need("ADMIN_ORIGIN") });
}
const file = `dist/stickermap/wrangler.${target}.generated.json`;
writeFileSync(file, JSON.stringify(config));
const args = target === "migrate" ? ["d1", "migrations", "apply", "stickermap", "--remote", "-c", file] : ["deploy", "-c", file];
execFileSync("npx", ["wrangler", ...args], { stdio: "inherit" });
