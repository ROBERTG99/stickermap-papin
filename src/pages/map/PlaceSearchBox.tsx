import { useEffect, useRef, useState } from "preact/hooks";
import { PlaceSearch } from "../../components/AppHeader";
import { lang, t } from "../../lib/i18n";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, searchPlaces, type PlaceResult } from "../../map/search";

interface Props {
  onPick: (place: PlaceResult) => void;
}

type Status = "idle" | "loading" | "ready" | "empty" | "error";

/** Place search (Photon): debounced 300 ms, a results list under the field, picking one flies the map there. */
export function PlaceSearchBox({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const language = lang.value;

  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(q, language, ctrl.signal)
        .then((found) => {
          setResults(found);
          setStatus(found.length > 0 ? "ready" : "empty");
          setActive(-1);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults([]);
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, language]);

  // Click or tap outside closes the list.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (place: PlaceResult) => {
    setOpen(false);
    setQuery(place.name);
    setResults([]);
    setStatus("idle");
    onPick(place);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const chosen = results[active >= 0 ? active : 0];
      if (chosen && status === "ready") {
        e.preventDefault();
        pick(chosen);
      }
    }
  };

  const showList = open && status !== "idle";
  return (
    <div class="map-search" ref={rootRef} onKeyDown={onKeyDown} onFocusIn={() => setOpen(true)}>
      <PlaceSearch value={query} onInput={setQuery} />
      {showList && (
        <ul class="mp-listbox map-search__list" role="listbox" aria-label={t("map.search.results")}>
          {status === "loading" && <li class="map-search__note">{t("map.search.searching")}</li>}
          {status === "empty" && <li class="map-search__note">{t("map.search.none")}</li>}
          {status === "error" && <li class="map-search__note">{t("map.search.error")}</li>}
          {status === "ready" &&
            results.map((r, i) => (
              <li key={r.id} role="presentation">
                <button type="button" role="option" aria-selected={i === active} class="mp-option map-search__option" onClick={() => pick(r)}>
                  <span class="map-search__name">{r.name}</span>
                  {r.detail && <span class="mp-option__meta map-search__detail">{r.detail}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
