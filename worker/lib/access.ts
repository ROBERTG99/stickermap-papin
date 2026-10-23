import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Env } from "../env";

export interface AdminIdentity { email: string }

const jwksCache = new Map<string, JWTVerifyGetKey>();

/**
 * Verify the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) against the team's JWKS (BUILD.md §8).
 * Production: needs ACCESS_TEAM_DOMAIN + ACCESS_AUD, otherwise nobody is admin.
 * Development only: with ACCESS_TEAM_DOMAIN empty, `DEV_ADMIN_EMAIL` in .dev.vars grants admin to requests for localhost.
 * `keys` lets tests inject a JWKS.
 */
export async function adminFromRequest(env: Env & { DEV_ADMIN_EMAIL?: string }, req: Request, keys?: JWTVerifyGetKey): Promise<AdminIdentity | null> {
  if (!env.ACCESS_TEAM_DOMAIN) {
    const host = new URL(req.url).hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    return local && env.DEV_ADMIN_EMAIL ? { email: env.DEV_ADMIN_EMAIL } : null;
  }
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_AUD) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let jwks = keys ?? jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
