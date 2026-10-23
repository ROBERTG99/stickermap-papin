/** Minimal ULID (Crockford base32, 48-bit time + 80-bit randomness). Portable: Workers, Node and browsers. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function encodeUlid(timeMs: number, randomness: Uint8Array): string {
  if (randomness.length < 10) throw new Error("ulid needs 10 random bytes");
  let time = "";
  let t = Math.floor(timeMs);
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  // 80 random bits -> 16 base32 chars, 5 bits at a time
  let bits = 0;
  let acc = 0;
  let rand = "";
  for (let i = 0; i < 10; i++) {
    acc = (acc << 8) | randomness[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rand += ALPHABET[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return time + rand;
}

export function newUlid(timeMs = Date.now()): string {
  return encodeUlid(timeMs, crypto.getRandomValues(new Uint8Array(10)));
}
