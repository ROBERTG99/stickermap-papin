import { useEffect, useRef } from "preact/hooks";

/** Keys of the review queue (design README, Admin): A aprobar · O ocultar · B borrar · J/K next/previous · G photo GPS · / search · ? help. */
export type ShortcutKey = "a" | "o" | "b" | "j" | "k" | "g" | "/" | "?";

const KEYS = new Set<string>(["a", "o", "b", "j", "k", "g", "/", "?"]);

interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null;
}

/** Shortcuts must never fire while the admin is typing (inputs, textareas, selects, comboboxes, contenteditable). */
export function isTypingTarget(target: KeyLike["target"]): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute?.("role");
  return role === "combobox" || role === "textbox";
}

/** Which shortcut a key press is, or null (modified keys and typing contexts are ignored). */
export function matchShortcut(e: KeyLike): ShortcutKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return KEYS.has(key) ? (key as ShortcutKey) : null;
}

/** Window-level shortcuts; `active=false` (a dialog is open) turns them all off. */
export function useShortcuts(handlers: Partial<Record<ShortcutKey, () => void>>, active = true): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const key = matchShortcut(e);
      const run = key ? ref.current[key] : undefined;
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
