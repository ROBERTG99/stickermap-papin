/** Cloudflare bindings and secrets of the Worker (wrangler.jsonc + `wrangler secret put`). */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PHOTOS: R2Bucket;
  PUBLIC_TURNSTILE_SITEKEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  CONTACT_EMAIL: string;
  TURNSTILE_SECRET: string;
  IP_HASH_SECRET: string;
  /** .dev.vars only: grants admin on localhost when Cloudflare Access is not configured. */
  DEV_ADMIN_EMAIL?: string;
}
