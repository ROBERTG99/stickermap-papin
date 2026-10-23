import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  BatchItem,
  BatchList,
  BatchSummary,
  DropZone,
  IphoneHint,
  LocationSuggestion,
  SameStickerHint,
  batchFilterOf,
  type BatchFilter,
  type BatchRow,
} from "../../../components/BatchItem";
import { Icon } from "../../../components/Icon";
import {
  LocationBadge,
  LocationPicker,
  type LocationState,
  type SearchResult,
} from "../../../components/LocationPicker";

/* Layout-only inline styles for the dev page itself (the design system has no classes for page grids). */
const CARDS = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(326px, 1fr))", gap: "var(--space-6)", alignItems: "start" } as const;
const STACK = { display: "grid", gap: "var(--space-3)", alignContent: "start" } as const;
const ROW = { display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center" } as const;
const NARROW = { ...STACK, maxWidth: "400px" } as const;
const WIDE = { ...STACK, maxWidth: "760px" } as const;

function Caption({ children }: { children: ComponentChildren }) {
  return <span class="mp-field__label">{children}</span>;
}

/** Static stand-in for the MapLibre mini-map: the pin is centred by the `mp-photo` frame. */
function FakeMap({ grey }: { grey?: boolean }) {
  return (
    <span class="mp-pin">
      <span class="mp-pin__head" style={grey ? { background: "var(--line-strong)" } : undefined} />
      <span class="mp-pin__shadow" />
    </span>
  );
}

const noop = () => {};

const PLACES: SearchResult[] = [
  { id: "mvd", label: "Plaza Independencia, Montevideo" },
  { id: "salto", label: "Plaza Independencia, Salto" },
  { id: "mad", label: "Plaza de la Independencia, Madrid" },
];

/** One static card of the nine states; only the "aproximada" switch is live. */
function PickerCard(props: {
  caption: string;
  state: LocationState;
  locateDenied?: boolean;
  searchResults?: SearchResult[];
  defaultQuery?: string;
}) {
  const { caption, state, ...rest } = props;
  const [approximate, setApproximate] = useState(false);
  return (
    <div style={STACK}>
      <Caption>{caption}</Caption>
      <LocationPicker
        state={state}
        approximate={approximate}
        onApproximateChange={setApproximate}
        onUseDevice={noop}
        onSearch={noop}
        onPaste={noop}
        onPickConflict={noop}
        onRevert={noop}
        {...rest}
      >
        <FakeMap grey={state.kind === "empty" || state.kind === "resolving"} />
      </LocationPicker>
    </div>
  );
}

/** The whole resolution flow wired to fake sources, to try the callbacks. */
function InteractivePicker() {
  const [state, setState] = useState<LocationState>({ kind: "empty" });
  const [approximate, setApproximate] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pasteError, setPasteError] = useState<string>();
  const fixes = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const useDevice = () => {
    setState({ kind: "resolving" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // Alternate a good fix and a coarse one to see both badges.
      const accuracyM = fixes.current++ % 2 === 0 ? 12 : 180;
      setState(accuracyM > 100 ? { kind: "lowAccuracy", accuracyM } : { kind: "device", accuracyM });
    }, 900);
  };
  const simulateDrag = () => {
    const from =
      state.kind === "exif" ? "exif"
      : state.kind === "device" || state.kind === "lowAccuracy" ? "device"
      : state.kind === "search" ? "search"
      : state.kind === "link" ? "paste"
      : state.kind === "moved" ? state.from
      : undefined;
    setState({ kind: "moved", from });
  };
  const revert = () => {
    if (state.kind !== "moved") return;
    setState(
      state.from === "device" ? { kind: "device", accuracyM: 12 }
      : state.from === "search" ? { kind: "search" }
      : state.from === "paste" ? { kind: "link", text: "-34.9061, -56.1993", coords: "-34.9061, -56.1993" }
      : { kind: "exif" },
    );
  };
  const parse = (text: string) => {
    const m = /(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/.exec(text);
    if (!m || m[1] === undefined || m[2] === undefined) {
      setPasteError("No pudimos leer coordenadas. Probá con “lat, lng”.");
      return;
    }
    setPasteError(undefined);
    setState({ kind: "link", text, coords: `${m[1]}, ${m[2]}` });
  };

  return (
    <div style={STACK}>
      <Caption>Interactivo (fuentes simuladas)</Caption>
      <LocationPicker
        state={state}
        approximate={approximate}
        onApproximateChange={setApproximate}
        onUseDevice={useDevice}
        onSearch={(q) => setResults(q ? PLACES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) : [])}
        searchResults={results}
        onPickResult={() => {
          setResults([]);
          setState({ kind: "search" });
        }}
        onPaste={parse}
        pasteError={pasteError}
        onPickConflict={(which) => setState(which === "exif" ? { kind: "exif" } : { kind: "device", accuracyM: 12 })}
        onRevert={revert}
      >
        <FakeMap grey={state.kind === "empty" || state.kind === "resolving"} />
      </LocationPicker>
      <div style={ROW}>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => setState({ kind: "exif" })}>
          Foto con GPS
        </button>
        <button
          type="button"
          class="mp-btn mp-btn--quiet mp-btn--sm"
          onClick={() =>
            setState({
              kind: "conflict",
              selected: "exif",
              distanceKm: 12400,
              exif: { place: "Shanghái", map: <FakeMap /> },
              device: { place: "Auburn", map: <FakeMap /> },
            })
          }
        >
          Conflicto
        </button>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={simulateDrag} disabled={state.kind === "empty"}>
          Arrastrar el pin
        </button>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => setState({ kind: "empty" })}>
          Reiniciar
        </button>
      </div>
    </div>
  );
}

function LocationPickerSection() {
  return (
    <section style={STACK}>
      <h2 class="mp-title">LocationPicker</h2>
      <div style={CARDS}>
        <PickerCard caption="2.1 Ubicación en la foto" state={{ kind: "exif" }} />
        <PickerCard caption="2.2 Foto recién sacada: buscando" state={{ kind: "resolving" }} />
        <PickerCard caption="2.2 Foto recién sacada: resuelto" state={{ kind: "device", accuracyM: 12 }} />
        <PickerCard caption="2.3 Galería sin GPS" state={{ kind: "empty" }} />
        <PickerCard
          caption="2.4 Conflicto foto vs vos"
          state={{
            kind: "conflict",
            selected: "exif",
            distanceKm: 12400,
            exif: { place: "Shanghái", map: <FakeMap /> },
            device: { place: "Auburn", map: <FakeMap /> },
          }}
        />
        <PickerCard caption="2.5 Búsqueda abierta" state={{ kind: "empty" }} searchResults={PLACES} defaultQuery="plaza indep" />
        <PickerCard caption="2.5 Búsqueda elegida" state={{ kind: "search" }} />
        <PickerCard
          caption="2.6 Link parseado"
          state={{ kind: "link", text: "https://maps.app.goo.gl/x7Qz", coords: "-34.9061, -56.1993" }}
        />
        <PickerCard caption="2.7 Permiso denegado" state={{ kind: "empty" }} locateDenied />
        <PickerCard caption="2.8 Precisión baja" state={{ kind: "lowAccuracy", accuracyM: 180 }} />
        <PickerCard caption="2.9 Ajustada a mano" state={{ kind: "moved", from: "exif" }} />
        <InteractivePicker />
      </div>
    </section>
  );
}

function LocationBadgeSection() {
  return (
    <section style={STACK}>
      <h2 class="mp-title">LocationBadge</h2>
      <div style={ROW}>
        <LocationBadge source="exif" />
        <LocationBadge source="pending" />
        <LocationBadge source="device" accuracyM={12} />
        <LocationBadge source="device" accuracyM={180} />
        <LocationBadge source="search" />
        <LocationBadge source="paste" />
        <LocationBadge source="pin" />
      </div>
    </section>
  );
}

const REVIEW_ROWS: BatchRow[] = [
  { kind: "ready", place: "Gran Vía 28, Madrid", time: "10:42", source: "exif", types: ["papa"] },
  { kind: "ready", place: "Plaza Mayor, Madrid", time: "11:31", source: "exif", types: ["sexo-punto"] },
  { kind: "noloc", time: "13:20" },
  { kind: "ready", place: "Puerta del Sol, Madrid", time: "13:20", source: "pin", types: ["papa"] },
  { kind: "exists", time: "9:58", place: "Plaza Independencia" },
  { kind: "dup", time: "11:05", sameAs: 2 },
  { kind: "error", reason: "archivo dañado" },
  { kind: "skipped", time: "14:03" },
];

const UPLOAD_ROWS: BatchRow[] = [
  { kind: "upload", place: "Gran Vía 28, Madrid", time: "10:42", state: "queued" },
  { kind: "upload", place: "Plaza Mayor, Madrid", time: "11:31", state: "busy", progress: 70 },
  { kind: "upload", place: "Calle de Alcalá, Madrid", time: "11:05", state: "done" },
  { kind: "upload", place: "Calle Mayor, Madrid", time: "12:40", state: "failed", detail: "se cortó la conexión" },
];

/** A list whose buttons really move rows between states. */
function InteractiveBatch() {
  const [rows, setRows] = useState<BatchRow[]>([
    { kind: "ready", place: "Gran Vía 28, Madrid", time: "10:42", source: "exif", types: ["papa"] },
    { kind: "noloc", time: "13:20" },
    { kind: "ready", place: "Plaza Mayor, Madrid", time: "11:31", source: "exif", types: ["sexo-punto", "papa"] },
    { kind: "noloc", time: "13:41" },
    { kind: "exists", time: "9:58", place: "Plaza Independencia" },
  ]);
  const [filter, setFilter] = useState<BatchFilter>("all");
  const [selected, setSelected] = useState<number | null>(0);

  const counts: Record<BatchFilter, number> = { all: rows.length, ready: 0, noloc: 0, skipped: 0 };
  for (const row of rows) counts[batchFilterOf(row)]++;

  const replace = (i: number, row: BatchRow) => setRows((all) => all.map((r, j) => (j === i ? row : r)));
  const shown = rows.map((row, i) => ({ row, i })).filter(({ row }) => filter === "all" || batchFilterOf(row) === filter);

  return (
    <div style={NARROW}>
      <BatchSummary filter={filter} counts={counts} onFilterChange={setFilter} />
      <BatchList label="Fotos del lote">
        {shown.map(({ row, i }) => (
          <BatchItem
            key={i}
            row={row}
            index={i}
            selected={selected === i}
            onEdit={() => setSelected(i)}
            onLocate={() => replace(i, { kind: "ready", place: "Puerta del Sol, Madrid", time: row.kind === "noloc" ? row.time : null, source: "pin", types: ["papa"] })}
            onSkip={() => replace(i, { kind: "skipped", time: row.kind === "noloc" ? row.time : null })}
            onRestore={() => replace(i, { kind: "noloc", time: row.kind === "skipped" ? row.time : null })}
            onView={() => setSelected(i)}
          />
        ))}
      </BatchList>
    </div>
  );
}

function BatchItemSection() {
  return (
    <section style={STACK}>
      <h2 class="mp-title">BatchItem</h2>
      <div style={CARDS}>
        <div style={NARROW}>
          <Caption>Estados de revisión</Caption>
          <BatchList>
            {REVIEW_ROWS.map((row, i) => (
              <BatchItem
                key={i}
                row={row}
                index={i}
                selected={i === 1}
                onEdit={noop}
                onLocate={noop}
                onSkip={noop}
                onRestore={noop}
                onView={noop}
              />
            ))}
          </BatchList>
        </div>
        <div style={NARROW}>
          <Caption>Estados de subida</Caption>
          <BatchList>
            {UPLOAD_ROWS.map((row, i) => (
              <BatchItem key={i} row={row} index={i} />
            ))}
          </BatchList>
          <div style={ROW}>
            <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm">
              <Icon name="rotate" size="sm" />
              Reintentar fallidas
            </button>
          </div>
        </div>
        <div style={NARROW}>
          <Caption>Interactivo (Ubicar, Omitir, Incluir y filtros)</Caption>
          <InteractiveBatch />
        </div>
      </div>
    </section>
  );
}

function DropZoneSection() {
  const [names, setNames] = useState<string[]>([]);
  return (
    <section style={STACK}>
      <h2 class="mp-title">DropZone</h2>
      <div style={CARDS}>
        <div style={STACK}>
          <Caption>Escritorio</Caption>
          <DropZone onFiles={(files) => setNames(files.map((f) => f.name))} />
          <span class="mp-field__hint" aria-live="polite">
            {names.length ? `${names.length} fotos: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : "Probá soltar fotos o una carpeta."}
          </span>
        </div>
        <div style={STACK}>
          <Caption>Arrastrando encima</Caption>
          <DropZone onFiles={noop} over />
        </div>
        <div style={STACK}>
          <Caption>Teléfono</Caption>
          <DropZone onFiles={noop} variant="phone" />
        </div>
      </div>
    </section>
  );
}

function IphoneHintSection() {
  return (
    <section style={STACK}>
      <h2 class="mp-title">IphoneHint</h2>
      <div style={NARROW}>
        <IphoneHint />
      </div>
    </section>
  );
}

function SuggestionSection() {
  return (
    <section style={STACK}>
      <h2 class="mp-title">LocationSuggestion</h2>
      <div style={NARROW}>
        <LocationSuggestion time="12:02" place="Puerta del Sol, Madrid" onUse={noop} />
        <LocationSuggestion time="10:42" place="Gran Vía 28, Madrid" hint="tocá para usarla y ajustá el pin" onUse={noop} />
      </div>
    </section>
  );
}

function SameStickerSection() {
  const [answer, setAnswer] = useState<string>();
  return (
    <section style={STACK}>
      <h2 class="mp-title">SameStickerHint</h2>
      <div style={NARROW}>
        <SameStickerHint
          a={1}
          b={5}
          meters={6}
          minutes={2}
          onMerge={() => setAnswer("Juntadas.")}
          onKeepSeparate={() => setAnswer("Quedan como fotos distintas.")}
        />
        <span class="mp-field__hint" aria-live="polite">{answer}</span>
      </div>
    </section>
  );
}

function BatchSummarySection() {
  const [filter, setFilter] = useState<BatchFilter>("all");
  return (
    <section style={STACK}>
      <h2 class="mp-title">BatchSummary</h2>
      <div style={WIDE}>
        <BatchSummary filter={filter} counts={{ all: 50, ready: 44, noloc: 3, skipped: 3 }} onFilterChange={setFilter} />
        <BatchSummary filter={filter} counts={{ all: 12, ready: 12, noloc: 0, skipped: 0 }} onFilterChange={setFilter} />
      </div>
    </section>
  );
}

export default function AddSection() {
  return (
    <div style={{ display: "grid", gap: "var(--space-8)" }}>
      <LocationPickerSection />
      <LocationBadgeSection />
      <BatchItemSection />
      <DropZoneSection />
      <IphoneHintSection />
      <SuggestionSection />
      <SameStickerSection />
      <BatchSummarySection />
    </div>
  );
}
