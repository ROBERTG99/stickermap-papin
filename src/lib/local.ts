/** localStorage helpers that never throw (private windows, blocked storage, previews). */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`mp:${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`mp:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: the app works without remembering */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(`mp:${key}`);
    } catch {
      /* ignore */
    }
  },
};

export const EDIT_WINDOW_MS = 24 * 3_600_000;

export interface EditGrant { token: string; createdAt: number }

/** Edit tokens handed out on create: `spot:<id>` or `batch:<id>` (valid 24 h, BUILD.md §7.3). */
export const editGrants = {
  all: () => storage.get<Record<string, EditGrant>>("editGrants", {}),
  save(key: string, token: string): void {
    const all = this.all();
    const fresh = Object.fromEntries(Object.entries(all).filter(([, g]) => Date.now() - g.createdAt < EDIT_WINDOW_MS));
    storage.set("editGrants", { ...fresh, [key]: { token, createdAt: Date.now() } });
  },
  get(key: string): EditGrant | null {
    const g = this.all()[key];
    return g && Date.now() - g.createdAt < EDIT_WINDOW_MS ? g : null;
  },
  remainingMs(key: string): number {
    const g = this.all()[key];
    return g ? Math.max(0, g.createdAt + EDIT_WINDOW_MS - Date.now()) : 0;
  },
};

export const lastPerson = {
  get: () => storage.get<string>("lastPerson", ""),
  set: (name: string) => storage.set("lastPerson", name.trim()),
};
