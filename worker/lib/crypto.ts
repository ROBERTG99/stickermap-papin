const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const toB64Url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message)));
}

/** Random URL-safe secret handed to the submitter (edit token) or used as an opaque id. */
export function randomToken(bytes = 32): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Tokens are stored only as their SHA-256. */
export const hashToken = (token: string) => sha256Hex(token);

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── batch token (BUILD.md §7.3b): HMAC(batchId, expiry, max spots) so each photo needs no Turnstile ──

export interface BatchClaims { batchId: string; expiresAt: number; max: number }

export async function signBatchToken(secret: string, claims: BatchClaims): Promise<string> {
  const payload = toB64Url(enc.encode(JSON.stringify({ b: claims.batchId, e: claims.expiresAt, m: claims.max })));
  const sig = toB64Url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload)));
  return `${payload}.${sig}`;
}

/** Returns the claims, or null when the signature is wrong, the token malformed or expired. */
export async function verifyBatchToken(secret: string, token: string, now = Date.now()): Promise<BatchClaims | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64Url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { b: string; e: number; m: number };
    if (typeof c.b !== "string" || typeof c.e !== "number" || typeof c.m !== "number" || c.e <= now) return null;
    return { batchId: c.b, expiresAt: c.e, max: c.m };
  } catch {
    return null;
  }
}
