/** Request validation shared by the Worker and the front end (BUILD.md §8, §9). */
import { z } from "zod";
import { normalizeHandle, normalizePostUrl } from "./instagram";

export const MAX = {
  displayBytes: 1_500_000,
  thumbBytes: 200_000,
  originalBytes: 25 * 1024 * 1024,
  name: 255,
  note: 280,
  otherText: 40,
  batchSpots: 100,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);
const person = z.string().trim().min(1).max(MAX.name);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

/** Optional Instagram fields: blank means "none", anything else must be valid (the server stores the normalized form). */
const igHandle = z.string().trim().max(40).refine((v) => v === "" || normalizeHandle(v) !== null, "invalid_instagram").nullish();
const igPost = z.string().trim().max(300).refine((v) => v === "" || normalizePostUrl(v) !== null, "invalid_instagram_post").nullish();

const coords = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

export const createSpotMeta = z
  .object({
    ...coords,
    location_source: z.enum(["exif", "device", "pin", "search", "paste"]),
    location_accuracy_m: z.number().min(0).max(1_000_000).nullish(),
    is_approximate: z.boolean().default(false),
    types: z.array(slug).min(1).max(12),
    other_text: trimmed(MAX.otherText).nullish(),
    reporter: person.nullish(),
    /** Handle of the reporter; only stored when that person has none yet (changing one is admin-only). */
    reporter_instagram: igHandle,
    instagram_post_url: igPost,
    note: trimmed(MAX.note).nullish(),
    /** EXIF DateTimeOriginal as naive local time. */
    taken_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).nullish(),
    /** SHA-256 of the original bytes (dedupe). The server recomputes it when the original is uploaded. */
    photo_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
    /** Client id of the photo inside a batch (idempotent retries). */
    client_ref: z.string().min(1).max(64).nullish(),
    turnstile_token: z.string().max(4096).nullish(),
  });
export type CreateSpotMeta = z.infer<typeof createSpotMeta>;

export const addTypesBody = z.object({
  types: z.array(slug).min(1).max(12),
  other_text: trimmed(MAX.otherText).nullish(),
  reporter: person.nullish(),
  turnstile_token: z.string().max(4096).nullish(),
});

export const createBatchBody = z.object({
  reporter: person.nullish(),
  turnstile_token: z.string().max(4096).nullish(),
});

export const reportBody = z.object({
  reason: z.literal("reported").default("reported"),
  note: trimmed(MAX.note).nullish(),
  turnstile_token: z.string().max(4096).nullish(),
});

/** Fields a submitter may change on their own spot for 24 h. */
export const patchOwnSpot = z
  .object({
    ...Object.fromEntries(Object.entries(coords).map(([k, v]) => [k, v.optional()])) as { lat: z.ZodOptional<z.ZodNumber>; lng: z.ZodOptional<z.ZodNumber> },
    types: z.array(slug).min(1).max(12).optional(),
    other_text: trimmed(MAX.otherText).nullish(),
    note: trimmed(MAX.note).nullish(),
    is_approximate: z.boolean().optional(),
  })
  .strict();

export const sha256List = z.object({ sha256: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(100) });
