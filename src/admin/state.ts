import { signal } from "@preact/signals";
import { ApiError } from "../lib/api";
import { adminApi, type AdminPerson, type AdminType } from "./api";

export type AuthState = "loading" | "ok" | "denied" | "offline";

/** Who is signed in (from Cloudflare Access). `denied` shows the login card of Page10Admin. */
export const auth = signal<{ state: AuthState; email: string | null }>({ state: "loading", email: null });

/** Every sticker type (active or not) and every person, for the editors. Refreshed after each change. */
export const adminTypes = signal<AdminType[]>([]);
export const adminPeople = signal<AdminPerson[]>([]);

/** Sidebar badges: spots waiting for review and all spots. */
export const counts = signal<{ queue: number | null; total: number | null; sightings: number | null }>({ queue: null, total: null, sightings: null });

export async function checkAuth(): Promise<void> {
  auth.value = { state: "loading", email: null };
  try {
    const me = await adminApi.me();
    auth.value = { state: "ok", email: me.email };
  } catch (e) {
    auth.value = { state: e instanceof ApiError && e.status !== 0 ? "denied" : "offline", email: null };
  }
}

export async function loadAdminTypes(): Promise<void> {
  try {
    adminTypes.value = await adminApi.types();
  } catch {
    /* the pages that need them show their own error */
  }
}

export async function loadAdminPeople(): Promise<void> {
  try {
    adminPeople.value = await adminApi.people();
  } catch {
    /* idem */
  }
}

export async function refreshCounts(): Promise<void> {
  try {
    const [queue, total, sightings] = await Promise.all([
      adminApi.spots(new URLSearchParams({ status: "queue", limit: "1" })),
      adminApi.spots(new URLSearchParams({ limit: "1" })),
      adminApi.sightings("pending").catch(() => null),
    ]);
    counts.value = { queue: queue.total, total: total.total, sightings: sightings?.pending ?? null };
  } catch {
    /* badges are a nicety */
  }
}
