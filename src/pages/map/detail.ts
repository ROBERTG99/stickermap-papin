import { useEffect, useState } from "preact/hooks";
import { api, ApiError } from "../../lib/api";
import type { SpotDetail } from "../../shared/types";

const cache = new Map<string, SpotDetail>();

export type DetailStatus = "loading" | "ready" | "missing" | "offline" | "error";

interface DetailState {
  id: string;
  status: DetailStatus;
  detail: SpotDetail | null;
}

/** `GET /api/spots/:id` for the selected spot (note, other_text...). "missing" = 404: unknown or hidden. */
export function useSpotDetail(id: string | undefined): { status: DetailStatus; detail: SpotDetail | null } {
  const [state, setState] = useState<DetailState | null>(null);

  useEffect(() => {
    if (!id) return;
    const cached = cache.get(id);
    if (cached) {
      setState({ id, status: "ready", detail: cached });
      return;
    }
    let alive = true;
    setState({ id, status: "loading", detail: null });
    api
      .spot(id)
      .then((detail) => {
        cache.set(id, detail);
        if (alive) setState({ id, status: "ready", detail });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const status: DetailStatus = e instanceof ApiError ? (e.status === 404 ? "missing" : e.offline ? "offline" : "error") : "error";
        setState({ id, status, detail: null });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!id) return { status: "loading", detail: null };
  const cached = cache.get(id);
  if (cached) return { status: "ready", detail: cached };
  if (state && state.id === id) return { status: state.status, detail: state.detail };
  return { status: "loading", detail: null };
}
