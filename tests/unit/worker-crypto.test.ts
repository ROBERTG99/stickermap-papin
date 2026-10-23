import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { adminFromRequest } from "../../worker/lib/access";
import { hashToken, hmacHex, randomToken, signBatchToken, timingSafeEqual, verifyBatchToken } from "../../worker/lib/crypto";
import { sniffImage } from "../../worker/lib/images";
import { formatPlace } from "../../worker/lib/geocode";
import type { Env } from "../../worker/env";

describe("batch token (HMAC, expiry, max count)", () => {
  const secret = "test-secret";
  it("round-trips the claims", async () => {
    const exp = Date.now() + 60_000;
    const token = await signBatchToken(secret, { batchId: "01ABC", expiresAt: exp, max: 100 });
    expect(await verifyBatchToken(secret, token)).toEqual({ batchId: "01ABC", expiresAt: exp, max: 100 });
  });
  it("rejects a tampered payload, a wrong secret, an expired token and garbage", async () => {
    const token = await signBatchToken(secret, { batchId: "01ABC", expiresAt: Date.now() + 60_000, max: 100 });
    const [payload, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ b: "01ABC", e: Date.now() + 60_000, m: 9999 })).replaceAll("=", "");
    expect(await verifyBatchToken(secret, `${forged}.${sig}`)).toBeNull();
    expect(await verifyBatchToken("other", token)).toBeNull();
    expect(await verifyBatchToken(secret, token, Date.now() + 120_000)).toBeNull();
    expect(await verifyBatchToken(secret, "nope")).toBeNull();
    expect(payload).toBeTruthy();
  });
});

describe("tokens", () => {
  it("hashes deterministically and compares in constant shape", async () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashToken(t)).toBe(await hashToken(t));
    expect(await hashToken(t)).not.toBe(await hashToken(randomToken()));
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(await hmacHex("k", "m")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sniffImage", () => {
  const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(32).fill(0)]);
  it("recognises the allowed formats from magic bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("png");
    expect(sniffImage(Uint8Array.from([...Buffer.from("RIFF\0\0\0\0WEBP"), 0, 0]))).toBe("webp");
    expect(sniffImage(Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from("ftypheic"), 0]))).toBe("heic");
  });
  it("rejects SVG, HTML and unknown content", () => {
    expect(sniffImage(Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(sniffImage(Uint8Array.from(Buffer.from("<html></html>")))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe("Access JWT verifier (mock JWKS)", () => {
  const team = "team.cloudflareaccess.com";
  const aud = "aud-tag";
  const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } as unknown as Env;

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" };
    return { privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
  }
  const sign = (key: CryptoKey, claims: { aud?: string; iss?: string; email?: string; exp?: string }) =>
    new SignJWT({ email: claims.email ?? "admin@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setAudience(claims.aud ?? aud)
      .setIssuer(claims.iss ?? `https://${team}`)
      .setExpirationTime(claims.exp ?? "5m")
      .sign(key);
  const req = (jwt?: string) => new Request("https://stickermap.example.workers.dev/api/admin/me", { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} });

  it("accepts a valid token and returns the email", async () => {
    const { privateKey, keys } = await setup();
    expect(await adminFromRequest(env, req(await sign(privateKey, {})), keys)).toEqual({ email: "admin@example.com" });
  });
  it("rejects missing, wrong-audience, wrong-issuer and expired tokens", async () => {
    const { privateKey, keys } = await setup();
    expect(await adminFromRequest(env, req(), keys)).toBeNull();
    expect(await adminFromRequest(env, req(await sign(privateKey, { aud: "other" })), keys)).toBeNull();
    expect(await adminFromRequest(env, req(await sign(privateKey, { iss: "https://evil.example.com" })), keys)).toBeNull();
    expect(await adminFromRequest(env, req(await sign(privateKey, { exp: "-1m" })), keys)).toBeNull();
  });
  it("never grants admin in production when Access is not configured", async () => {
    const open = { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "", DEV_ADMIN_EMAIL: "dev@example.com" } as unknown as Env & { DEV_ADMIN_EMAIL?: string };
    expect(await adminFromRequest(open, req())).toBeNull(); // workers.dev host: bypass only works on localhost
    expect(await adminFromRequest(open, new Request("http://localhost:5173/api/admin/me"))).toEqual({ email: "dev@example.com" });
  });
});

describe("formatPlace", () => {
  it("prefers city + region, falls back to the country", () => {
    expect(formatPlace({ city: "Bariloche", state: "Río Negro", country: "Argentina", country_code: "AR" })).toEqual({
      place_name: "Bariloche, Río Negro", city: "Bariloche", country: "Argentina", country_code: "ar",
    });
    expect(formatPlace({ country: "Mónaco", country_code: "mc" })?.place_name).toBe("Mónaco");
    expect(formatPlace({ city: "Singapur", state: "Singapur" })?.place_name).toBe("Singapur");
    expect(formatPlace({})).toBeNull();
  });
});
