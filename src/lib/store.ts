import { computed, signal } from "@preact/signals";
import type { AppConfig, PersonSummary, SpotCollection, StickerType } from "../shared/types";
import { api } from "./api";
import { storage } from "./local";

/** App-wide data. Everything is cached in localStorage so the map still opens offline ("Mostramos lo último que viste"). */
export const config = signal<AppConfig | null>(storage.get<AppConfig | null>("cache:config", null));
export const types = signal<StickerType[]>(storage.get<StickerType[]>("cache:types", []));
export const people = signal<PersonSummary[]>(storage.get<PersonSummary[]>("cache:people", []));
export const spots = signal<SpotCollection | null>(storage.get<SpotCollection | null>("cache:spots", null));
export const spotsStatus = signal<"loading" | "ready" | "offline">(spots.value ? "ready" : "loading");
export const online = signal(navigator.onLine);

addEventListener("online", () => { online.value = true; });
addEventListener("offline", () => { online.value = false; });

export const typeBySlug = computed(() => new Map(types.value.map((t) => [t.slug, t])));
export const spotById = computed(() => new Map((spots.value?.features ?? []).map((f) => [f.id, f])));

async function load<T>(name: string, run: () => Promise<T>, target: { value: T }): Promise<boolean> {
  try {
    target.value = await run();
    storage.set(`cache:${name}`, target.value);
    return true;
  } catch {
    return false;
  }
}

export async function loadBase(): Promise<void> {
  await Promise.all([load("config", api.config, config), load("types", api.types, types), load("people", api.people, people)]);
}

/** Fetch the spots; falls back to the last cached copy and reports `offline` when the network is down. */
export async function loadSpots(): Promise<void> {
  if (!spots.value) spotsStatus.value = "loading";
  const ok = await load("spots", api.spots, spots);
  spotsStatus.value = ok ? "ready" : spots.value ? "offline" : "offline";
}

// ── theme ─────────────────────────────────────────────────────────────────

export type ThemeChoice = "auto" | "light" | "dark";
export const theme = signal<ThemeChoice>(storage.get<ThemeChoice>("theme", "auto"));

export function setTheme(next: ThemeChoice): void {
  theme.value = next;
  storage.set("theme", next);
  applyTheme();
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (theme.value === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme.value;
}
applyTheme();
