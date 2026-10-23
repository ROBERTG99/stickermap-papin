/** Request validation shared by the Worker and the front end (BUILD.md §8, §9). */
import { z } from "zod";

export const MAX = {
  displayBytes: 1_500_000,
  thumbBytes: 200_000,
  originalBytes: 25 * 1024 * 1024,
  name: 255,
  note: 280,
  placerNote: 140,
  otherText: 40,
  batchSpots: 100,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);
const person = z.string().trim().min(1).max(MAX.name);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

const coords = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

const placerRules = (v: { reporter?: string | null; placer_status: string; placers: string[] }, ctx: z.RefinementCtx) => {
  if (v.placer_status === "self" && !v.reporter) ctx.addIssue({ code: "custom", path: ["reporter"], message: "self_requires_reporter" });
  if (v.placer_status === "other" && v.placers.length === 0) ctx.addIssue({ code: "custom", path: ["placers"], message: "other_requires_names" });
  if (v.placer_status !== "other" && v.placers.length > 0) ctx.addIssue({ code: "custom", path: ["placers"], message: "placers_only_for_other" });
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
    placer_status: z.enum(["self", "other", "unknown"]),
    placers: z.array(person).max(10).default([]),
    placer_note: trimmed(MAX.placerNote).nullish(),
    note: trimmed(MAX.note).nullish(),
    /** EXIF DateTimeOriginal as naive local time. */
    taken_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).nullish(),
    /** SHA-256 of the original bytes (dedupe). The server recomputes it when the original is uploaded. */
    photo_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
    /** Client id of the photo inside a batch (idempotent retries). */
    client_ref: z.string().min(1).max(64).nullish(),
    turnstile_token: z.string().max(4096).nullish(),
  })
  .superRefine(placerRules);
export type CreateSpotMeta = z.infer<typeof createSpotMeta>;

export const addTypesBody = z
  .object({
    types: z.array(slug).min(1).max(12),
    other_text: trimmed(MAX.otherText).nullish(),
    reporter: person.nullish(),
    placer_status: z.enum(["self", "other", "unknown"]),
    placers: z.array(person).max(10).default([]),
    turnstile_token: z.string().max(4096).nullish(),
  })
  .superRefine(placerRules);

export const createBatchBody = z.object({
  reporter: person.nullish(),
  turnstile_token: z.string().max(4096).nullish(),
});

export const reportBody = z.object({
  reason: z.enum(["reported", "know_placer"]).default("reported"),
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
    placer_status: z.enum(["self", "other", "unknown"]).optional(),
    placers: z.array(person).max(10).optional(),
    placer_note: trimmed(MAX.placerNote).nullish(),
    is_approximate: z.boolean().optional(),
  })
  .strict();

export const sha256List = z.object({ sha256: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(100) });
