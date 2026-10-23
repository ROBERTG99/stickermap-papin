import { computed, signal } from "@preact/signals";

export type ToastKind = "success" | "info" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  action?: ToastAction;
  /** Defaults to "info". */
  kind?: ToastKind;
  /**
   * Auto-dismiss delay in ms (default 4000). 0 keeps it until acted on or closed:
   * that is the default for error toasts that carry an action.
   */
  durationMs?: number;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  durationMs: number;
}

const DEFAULT_DURATION_MS = 4000;

const current = signal<ToastItem | null>(null);
const pending = signal<ToastItem[]>([]);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function advance(): void {
  clearTimer();
  const [next, ...rest] = pending.value;
  pending.value = rest;
  current.value = next ?? null;
  if (next && next.durationMs > 0) {
    const id = next.id;
    timer = setTimeout(() => {
      if (current.value?.id === id) advance();
    }, next.durationMs);
  }
}

/** Toast store: one toast on screen at a time, the rest wait in a queue. */
export const toast = {
  /** The toast on screen, or null. */
  current: computed(() => current.value),
  /** Toasts waiting their turn. */
  queued: computed(() => pending.value.length),

  show(input: ToastInput): number {
    const kind = input.kind ?? "info";
    const durationMs = input.durationMs ?? (kind === "error" && input.action ? 0 : DEFAULT_DURATION_MS);
    const item: ToastItem = { id: nextId++, message: input.message, kind, action: input.action, durationMs };
    pending.value = [...pending.value, item];
    if (current.value === null) advance();
    return item.id;
  },

  /** Dismiss the toast on screen and show the next one in the queue, if any. */
  dismiss(): void {
    advance();
  },

  /** Dismiss everything, queued toasts included. */
  clear(): void {
    pending.value = [];
    advance();
  },
};
