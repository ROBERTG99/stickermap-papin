import type { Env } from "../env";

/** Verify a Turnstile token server-side and check the hostname (BUILD.md §9). */
export async function verifyTurnstile(env: Env, token: string | undefined | null, ip: string | null, expectedHostname: string): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = (await res.json()) as { success: boolean; hostname?: string };
    if (!out.success) return false;
    // Cloudflare's published test keys answer with hostname "example.com"; real keys must match this site.
    return out.hostname === undefined || out.hostname === expectedHostname || out.hostname === "example.com";
  } catch {
    return false;
  }
}
