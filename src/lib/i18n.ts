import { computed, signal } from "@preact/signals";
import type { Lang } from "../shared/types";
import { storage } from "./local";

/**
 * Strings live in `src/i18n/<lang>/<area>.json`; the file name is the key prefix (`map.json` -> `map.filters.title`).
 * Nested objects flatten with dots. Spanish (rioplatense, voseo) is the default and the fallback.
 */
const files = import.meta.glob<Record<string, unknown>>("../i18n/*/*.json", { eager: true, import: "default" });

function flatten(prefix: string, value: unknown, out: Record<string, string>): void {
  if (typeof value === "string") out[prefix] = value;
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(`${prefix}.${k}`, v, out);
}

const dictionaries: Record<Lang, Record<string, string>> = { es: {}, en: {} };
for (const [path, json] of Object.entries(files)) {
  const [, lang, file] = /\/i18n\/(es|en)\/([^/]+)\.json$/.exec(path) ?? [];
  if (lang && file) flatten(file, json, dictionaries[lang as Lang]);
}

const initial = storage.get<Lang | null>("lang", null) ?? (document.documentElement.lang === "en" ? "en" : "es");
export const lang = signal<Lang>(initial);
export const dictionary = computed(() => dictionaries[lang.value]);

export function setLang(next: Lang): void {
  lang.value = next;
  storage.set("lang", next);
  document.documentElement.lang = next;
}

/** Look up a string; `{name}` placeholders are replaced from `vars`. Reading `lang.value` subscribes components to language changes. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang.value][key] ?? dictionaries.es[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : text;
}
