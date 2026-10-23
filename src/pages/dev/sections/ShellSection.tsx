import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { AppHeader, PlaceSearch } from "../../../components/AppHeader";
import { Avatar, AvatarGroup } from "../../../components/Avatar";
import { Badge, CountBadge, SourceBadge } from "../../../components/Badge";
import { Banner, FirstVisitHint } from "../../../components/Banner";
import { DataTable, type Column, type SortState } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { Flag } from "../../../components/Flag";
import { Icon } from "../../../components/Icon";
import { Leaderboard, type LeaderboardRow } from "../../../components/Leaderboard";
import { Polaroid, TypeSticker, type PhotoTone, type StickerTypeRef } from "../../../components/Polaroid";
import { GallerySkeleton, Skeleton, SpotSkeleton } from "../../../components/Skeleton";
import { StatSticker, TypeCount } from "../../../components/StatSticker";
import { SubmitBar, ProgressBar } from "../../../components/ProgressBar";
import { TabBar } from "../../../components/TabBar";
import { Toast } from "../../../components/Toast";
import { cx } from "../../../lib/cx";
import { toast } from "../../../lib/toast";

/* ── layout helpers (kitchen sink only) ─────────────────────────────── */

const stack = { display: "grid", gap: "var(--space-4)" } as const;
const wrap = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)" } as const;
const phone = { width: "100%", maxWidth: "390px" } as const;

function Block({ caption, children }: { caption: string; children: ComponentChildren }) {
  return (
    <div style={stack}>
      <p class="mp-keys">{caption}</p>
      {children}
    </div>
  );
}

/* ── sample data ────────────────────────────────────────────────────── */

type TypeRef = StickerTypeRef & { label: string };

const T = {
  papa: { slug: "papa", label: "Papa" },
  punto: { slug: "sexo-punto", label: "Sexo." },
  pregunta: { slug: "sexo-pregunta", label: "Sexo?" },
  og: { slug: "sexo-pregunta-og", label: "Sexo? OG" },
  otro: { slug: "otro", label: "Otro" },
} satisfies Record<string, TypeRef>;

const ALL_TYPES: readonly TypeRef[] = [T.papa, T.punto, T.pregunta, T.og, T.otro];
const TYPE_COUNTS = [44, 63, 20, 0, 35] as const;

interface PolaroidSample {
  id: string;
  types: readonly TypeRef[];
  tone: PhotoTone;
  ratio: string;
  place: string;
  placer: string | null;
}

const POLAROIDS: readonly PolaroidSample[] = [
  { id: "a1", types: [T.punto], tone: "night", ratio: "4/5", place: "Times Square, Nueva York", placer: "Caro" },
  { id: "a2", types: [T.papa, T.punto], tone: "stone", ratio: "1/1", place: "Luxor, Egipto", placer: "Beto" },
  { id: "a3", types: [T.papa], tone: "snow", ratio: "3/4", place: "Bariloche, Argentina", placer: "Ana" },
  { id: "a4", types: [T.pregunta], tone: "tiles", ratio: "4/5", place: "Aeropuerto de Incheon, Seúl", placer: "Gus" },
  { id: "a5", types: [T.papa, T.punto, T.otro], tone: "brick", ratio: "1/1", place: "Plaza Independencia, Montevideo", placer: null },
];

const COUNTRIES: readonly [string, string][] = [
  ["ar", "Argentina"],
  ["au", "Australia"],
  ["br", "Brasil"],
  ["cl", "Chile"],
  ["cn", "China"],
  ["kr", "Corea del Sur"],
  ["us", "EE.UU."],
  ["eg", "Egipto"],
  ["es", "España"],
  ["fr", "Francia"],
  ["ie", "Irlanda"],
  ["it", "Italia"],
  ["jp", "Japón"],
  ["mx", "México"],
  ["gb", "Reino Unido"],
  ["uy", "Uruguay"],
];

const NAMES = ["Ana", "Beto", "Dani", "Caro", "Fede", "Enzo", "Gus", "Hugo"] as const;

const PLACED: readonly LeaderboardRow[] = [
  { name: "Ana", count: 46, isYou: true },
  { name: "Beto", count: 21 },
  { name: "Dani", count: 11 },
  { name: "Caro", count: 5 },
  { name: "Fede", count: 5 },
  { name: "Enzo", count: 4 },
  { name: "Gus", count: 3 },
  { name: "Hugo", count: 2 },
  { name: "Mica", count: 1 },
];

const REPORTED: readonly LeaderboardRow[] = [
  { name: "Beto", count: 1203 },
  { name: "Ana", count: 98, isYou: true },
  { name: "Caro", count: 41 },
  { name: "Dani", count: 12 },
  { name: "Fede", count: 9 },
  { name: "Enzo", count: 3 },
];

/* ── Toast ──────────────────────────────────────────────────────────── */

function ToastDemo() {
  return (
    <div style={stack}>
      <div style={{ ...stack, justifyItems: "start" }}>
        <Toast kind="success" message="Link copiado. Mandáselo a quien quieras." />
        <Toast kind="error" message="No pudimos guardar." action={{ label: "Reintentar", onClick: () => undefined }} />
        <Toast kind="info" message="Gracias, lo vamos a revisar." action={{ label: "Deshacer", onClick: () => undefined }} />
      </div>
      <div style={wrap}>
        <button
          type="button"
          class="mp-btn mp-btn--secondary mp-btn--sm"
          onClick={() => toast.show({ kind: "success", message: "Link copiado. Mandáselo a quien quieras." })}
        >
          Toast de éxito
        </button>
        <button
          type="button"
          class="mp-btn mp-btn--secondary mp-btn--sm"
          onClick={() =>
            toast.show({
              kind: "error",
              message: "No pudimos guardar.",
              action: { label: "Reintentar", onClick: () => toast.show({ message: "Probando de nuevo…" }) },
            })
          }
        >
          Toast de error
        </button>
        <button
          type="button"
          class="mp-btn mp-btn--secondary mp-btn--sm"
          onClick={() =>
            toast.show({
              message: "Gracias, lo vamos a revisar.",
              action: { label: "Deshacer", onClick: () => toast.show({ kind: "success", message: "Listo, deshecho." }) },
            })
          }
        >
          Toast con acción
        </button>
        <button
          type="button"
          class="mp-btn mp-btn--secondary mp-btn--sm"
          onClick={() => {
            toast.show({ message: "Primero, uno." });
            toast.show({ message: "Después, otro." });
            toast.show({ kind: "success", message: "Y al final, el tercero." });
          }}
        >
          Encolar tres
        </button>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => toast.clear()}>
          Limpiar
        </button>
      </div>
    </div>
  );
}

/* ── Banner ─────────────────────────────────────────────────────────── */

function BannerDemo() {
  const [hint, setHint] = useState(true);
  return (
    <div style={stack}>
      <div style={{ ...stack, ...phone }}>
        <Banner kind="offline" action={{ label: "Reintentar", onClick: () => toast.show({ message: "Probando de nuevo…" }) }}>
          Sin conexión. Mostramos lo último que viste.
        </Banner>
        <Banner kind="countdown">
          Podés editar por <b class="mp-num">23 h 12 min</b>
        </Banner>
        <Banner kind="error">Se cortó la conexión. Tu sticker sigue acá.</Banner>
        <Banner kind="info">Estás viendo los stickers de Uruguay.</Banner>
      </div>
      <Block caption="Tarjeta de primera visita (1 paso)">
        <div style={phone}>
          {hint ? (
            <FirstVisitHint onDismiss={() => setHint(false)} />
          ) : (
            <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={() => setHint(true)}>
              Mostrar la tarjeta de nuevo
            </button>
          )}
        </div>
      </Block>
    </div>
  );
}

/* ── ProgressBar ────────────────────────────────────────────────────── */

function ProgressDemo() {
  const [progress, setProgress] = useState(64);
  return (
    <div style={stack}>
      <div style={{ ...stack, ...phone }}>
        <SubmitBar state="disabled" missing="elegir el tipo y la ubicación" />
        <SubmitBar state="ready" onSubmit={() => toast.show({ kind: "success", message: "¡Mandaste mecha!" })} />
        <SubmitBar state="uploading" progress={progress} />
        <SubmitBar state="failed" onRetry={() => toast.show({ message: "Probando de nuevo…" })} />
      </div>
      <Block caption="Barra de envío: deshabilitada con pista · lista + Turnstile · subiendo · falló">
        <div style={{ ...phone, ...stack }}>
          <ProgressBar value={progress} label="Subiendo foto…" />
          <label class="mp-keys">
            Avance
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              aria-label="Avance de la subida"
              onInput={(e) => setProgress(Number(e.currentTarget.value))}
            />
          </label>
        </div>
      </Block>
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────── */

function BadgeDemo() {
  return (
    <div style={stack}>
      <Block caption="“+1” · contador · estados">
        <div style={wrap}>
          <Badge variant="plus">+1</Badge>
          <CountBadge count={3} />
          <Badge>Publicado</Badge>
          <Badge variant="brand" icon="check">
            Aprobado
          </Badge>
          <Badge variant="inverse">Oculto</Badge>
        </div>
      </Block>
      <Block caption="Origen de la ubicación: ícono + palabras, nunca emoji">
        <div style={wrap}>
          <SourceBadge icon="camera">Ubicación de la foto</SourceBadge>
          <SourceBadge icon="locate">Tu ubicación (±12 m)</SourceBadge>
          <SourceBadge icon="search">Búsqueda</SourceBadge>
          <SourceBadge icon="link">Link pegado</SourceBadge>
          <SourceBadge icon="hand" variant="manual">
            Ajustada a mano
          </SourceBadge>
          <SourceBadge icon="locate" variant="warn">
            Tu ubicación (±180 m)
          </SourceBadge>
          <SourceBadge icon="video">Ubicación del video</SourceBadge>
          <SourceBadge icon="qr">Escaneo de QR</SourceBadge>
          <SourceBadge icon="locate" variant="pending">
            Buscando tu ubicación…
          </SourceBadge>
        </div>
      </Block>
      <Block caption="Motivos de revisión (admin)">
        <div style={wrap}>
          <Badge variant="alert" icon="copy">
            Foto duplicada lejos
          </Badge>
          <Badge variant="alert" icon="pin">
            GPS de la foto no coincide
          </Badge>
          <Badge variant="solid" icon="flag">
            Reportado
          </Badge>
          <Badge icon="image">Sin foto</Badge>
        </div>
      </Block>
    </div>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────── */

function SkeletonDemo() {
  return (
    <div style={wrap}>
      <Block caption="Hoja del spot cargando">
        <div class="mp-sheet" style={{ ...phone, position: "relative" }} aria-busy="true">
          <span class="mp-sheet__grab" />
          <SpotSkeleton />
        </div>
      </Block>
      <Block caption="Galería cargando">
        <div style={{ width: "300px" }} aria-busy="true">
          <GallerySkeleton />
        </div>
      </Block>
      <Block caption="Línea y círculo (avatar)">
        <div style={wrap}>
          <Skeleton variant="circle" width={32} height={32} />
          <Skeleton variant="line" width={160} />
        </div>
      </Block>
    </div>
  );
}

/* ── Avatar / Flag ──────────────────────────────────────────────────── */

function AvatarDemo() {
  return (
    <div style={stack}>
      <Block caption="32px · color por hash del nombre · “¿?” desconocido">
        <div style={wrap}>
          {NAMES.map((name, i) => (
            <Avatar key={name} name={name} index={i} />
          ))}
          <Avatar name={null} />
        </div>
      </Block>
      <Block caption="96px perfil · 48px · 28px · 24px · grupo apilado">
        <div style={wrap}>
          <Avatar name="Ana" index={0} size="lg" />
          <Avatar name="Beto" index={1} size={48} />
          <Avatar name="Caro" index={2} size={28} />
          <Avatar name="Dani" index={3} size={24} />
          <AvatarGroup names={["Beto", "Caro", "Dani"]} />
          <span>Beto, Caro y Dani</span>
        </div>
      </Block>
    </div>
  );
}

function FlagDemo() {
  return (
    <div style={stack}>
      <Block caption="30×20 en rankings">
        <div style={wrap}>
          {COUNTRIES.map(([code, name]) => (
            <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", fontWeight: "600" }}>
              <Flag code={code} size="lg" />
              {name}
            </span>
          ))}
        </div>
      </Block>
      <Block caption="21×14 en metadatos y chips">
        <div style={wrap}>
          <span class="mp-spot__country">
            <Flag code="eg" /> Egipto
          </span>
          <span class="mp-chip">
            <Flag code="uy" />
            Uruguay
            <span class="mp-chip__count">19</span>
          </span>
        </div>
      </Block>
    </div>
  );
}

/* ── Polaroid / StatSticker / Leaderboard ───────────────────────────── */

function PolaroidDemo() {
  return (
    <div style={{ columns: "2", columnGap: "var(--space-5)", maxWidth: "460px", padding: "var(--space-3)" }}>
      {POLAROIDS.map((p, i) => (
        <div key={p.id} style={{ breakInside: "avoid", marginBottom: "var(--space-5)" }}>
          <Polaroid href={`/s/${p.id}`} index={i} types={p.types} tone={p.tone} ratio={p.ratio} place={p.place} placer={p.placer} />
        </div>
      ))}
    </div>
  );
}

function StatDemo() {
  const max = Math.max(...TYPE_COUNTS);
  return (
    <div style={stack}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "var(--space-4)", maxWidth: "640px" }}>
        <StatSticker value={156} label="spots" index={0} />
        <StatSticker value={162} label="stickers" tone="brand" index={1} />
        <StatSticker value={27} label="países" tone="butter" index={2} />
        <StatSticker value={17} label="personas" tone="peach" index={3} />
      </div>
      <Block caption="Por tipo, en el orden del admin; el 0 también se muestra">
        <div style={{ display: "grid", maxWidth: "420px" }}>
          {ALL_TYPES.map((type, i) => (
            <TypeCount key={type.slug} type={type} count={TYPE_COUNTS[i] ?? 0} max={max} />
          ))}
        </div>
      </Block>
      <Block caption="Stickers de tipo suelto">
        <div style={wrap}>
          {ALL_TYPES.map((type, i) => (
            <TypeSticker key={type.slug} type={type} size={36} index={i} />
          ))}
        </div>
      </Block>
    </div>
  );
}

function LeaderboardDemo() {
  const [board, setBoard] = useState<"placed" | "reported">("reported");
  return (
    <div style={{ ...stack, ...phone }}>
      <div class="mp-seg" role="radiogroup" aria-label="Ranking">
        <button type="button" class="mp-seg__opt" role="radio" aria-checked={board === "placed"} onClick={() => setBoard("placed")}>
          Más pegados
        </button>
        <button type="button" class="mp-seg__opt" role="radio" aria-checked={board === "reported"} onClick={() => setBoard("reported")}>
          Más cargados
        </button>
      </div>
      {board === "placed" ? (
        <Leaderboard key="placed" rows={PLACED} unit="stickers" footnote="49 stickers sin dueño todavía" />
      ) : (
        <Leaderboard key="reported" rows={REPORTED} unit="stickers" />
      )}
    </div>
  );
}

/* ── AppHeader / TabBar ─────────────────────────────────────────────── */

function HeaderDemo() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(2);
  return (
    <div style={stack}>
      <Block caption="Móvil: header flotante sobre el mapa (logo, menú, búsqueda, filtros con contador)">
        <div
          style={{
            position: "relative",
            ...phone,
            height: "150px",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            background: "var(--map-land)",
          }}
        >
          <AppHeader
            variant="floating"
            search={<PlaceSearch value={query} onInput={setQuery} />}
            filterCount={filters}
            onFilters={() => setFilters((n) => (n + 1) % 5)}
          />
        </div>
        <p class="mp-keys">Tocá el botón de filtros para cambiar el contador (0 a 4).</p>
      </Block>
      <Block caption="Móvil: barra de pantalla (agregar / editar)">
        <div style={phone}>
          <AppHeader variant="bar" title="Agregar sticker" onClose={() => toast.show({ message: "Cerrar" })} onHelp={() => toast.show({ message: "Ayuda" })} />
        </div>
      </Block>
      <Block caption="Desktop: top nav de 64px, con Mapa, Galería o Stats activo">
        <div style={{ ...stack, overflowX: "auto" }}>
          {(["map", "gallery", "stats"] as const).map((tab) => (
            <div key={tab} style={{ minWidth: "1100px", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "0 0 0 1px var(--line)" }}>
              <AppHeader variant="desktop" active={tab} filterCount={tab === "map" ? 2 : 0} />
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

function TabBarDemo() {
  return (
    <div style={wrap}>
      {(["map", "gallery", "stats"] as const).map((tab) => (
        <div key={tab} style={{ ...phone, borderRadius: "0 0 var(--radius-lg) var(--radius-lg)", overflow: "hidden" }}>
          <TabBar active={tab} />
        </div>
      ))}
    </div>
  );
}

/* ── DataTable ──────────────────────────────────────────────────────── */

interface SpotRow {
  id: string;
  place: string;
  cc: string;
  types: readonly TypeRef[];
  placers: readonly string[];
  reporter: string | null;
  date: string;
  status: "published" | "reported" | "hidden";
  tone: PhotoTone;
}

const BASE_ROWS: readonly Omit<SpotRow, "id">[] = [
  { place: "Puerta del Sol, Madrid", cc: "es", types: [T.papa], placers: ["Beto", "Caro"], reporter: "Ana", date: "2025-04-15", status: "published", tone: "pole" },
  { place: "Acantilados de Moher", cc: "ie", types: [T.papa], placers: [], reporter: "Ana", date: "2024-11-09", status: "published", tone: "stone" },
  { place: "Times Square, Nueva York", cc: "us", types: [T.punto], placers: ["Caro"], reporter: "Caro", date: "2024-09-14", status: "reported", tone: "night" },
  { place: "Luxor, Egipto", cc: "eg", types: [T.papa, T.punto], placers: ["Beto"], reporter: null, date: "2025-01-22", status: "published", tone: "stone" },
  { place: "Bariloche, Argentina", cc: "ar", types: [T.papa], placers: ["Ana"], reporter: "Ana", date: "2025-07-03", status: "hidden", tone: "snow" },
  { place: "Aeropuerto de Incheon, Seúl", cc: "kr", types: [T.pregunta], placers: ["Gus"], reporter: "Gus", date: "2023-12-30", status: "published", tone: "tiles" },
  { place: "Plaza Independencia, Montevideo", cc: "uy", types: [T.otro], placers: [], reporter: "Dani", date: "2025-02-11", status: "published", tone: "brick" },
  { place: "Shibuya, Tokio", cc: "jp", types: [T.og], placers: ["Fede"], reporter: "Fede", date: "2024-05-27", status: "published", tone: "sign" },
];

const ROWS: readonly SpotRow[] = Array.from({ length: 44 }, (_, i) => ({ ...BASE_ROWS[i % BASE_ROWS.length]!, id: String(i + 1) }));

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

function StatusBadge({ status }: { status: SpotRow["status"] }) {
  if (status === "reported") return <Badge variant="alert" icon="flag">Reportado</Badge>;
  if (status === "hidden") return <Badge variant="inverse">Oculto</Badge>;
  return <Badge>Publicado</Badge>;
}

const COLUMNS: readonly Column<SpotRow>[] = [
  {
    key: "photo",
    header: "Foto",
    cell: (r) => (
      <div class={cx("mp-photo", `mp-photo--${r.tone}`)} style={{ "--ratio": "1", "--tilt": "var(--tilt-1)" }} role="img" aria-label={`Foto: sticker ${r.types.map((t) => t.label).join(", ")}`}>
        {r.types[0] && <TypeSticker type={r.types[0]} />}
      </div>
    ),
  },
  {
    key: "types",
    header: "Tipos",
    cell: (r) => (
      <span style={{ display: "inline-flex", gap: "var(--space-1)" }}>
        {r.types.map((t) => (
          <TypeSticker key={t.slug} type={t} />
        ))}
      </span>
    ),
  },
  {
    key: "placers",
    header: "Pegado por",
    cell: (r) => (r.placers.length ? r.placers.join(", ") : <span style={{ color: "var(--ink-muted)" }}>¿?</span>),
  },
  { key: "reporter", header: "Cargado por", cell: (r) => r.reporter ?? "Anónimo" },
  {
    key: "place",
    header: "Lugar",
    sortable: true,
    cell: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <Flag code={r.cc} />
        {r.place}
      </span>
    ),
  },
  { key: "date", header: "Fecha", sortable: true, firstDir: "desc", numeric: true, cell: (r) => formatDate(r.date) },
  { key: "status", header: "Estado", cell: (r) => <StatusBadge status={r.status} /> },
];

const PAGE_SIZE = 4;

function sortRows(rows: readonly SpotRow[], sort: SortState | null): SpotRow[] {
  const out = [...rows];
  if (!sort) return out;
  const sign = sort.dir === "asc" ? 1 : -1;
  const pick = (r: SpotRow) => (sort.key === "date" ? r.date : r.place);
  return out.sort((a, b) => sign * pick(a).localeCompare(pick(b), "es"));
}

function DataTableDemo() {
  const [sort, setSort] = useState<SortState | null>({ key: "date", dir: "desc" });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["1", "2"]));
  const [page, setPage] = useState(1);
  const [unknownOnly, setUnknownOnly] = useState(true);
  const [state, setState] = useState<"data" | "loading" | "empty">("data");

  const sorted = sortRows(ROWS, sort);
  const slice = state === "empty" ? [] : sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={stack}>
      <div class="mp-seg" role="radiogroup" aria-label="Estado de la tabla" style={{ maxWidth: "360px" }}>
        {(
          [
            ["data", "Con datos"],
            ["loading", "Cargando"],
            ["empty", "Vacía"],
          ] as const
        ).map(([id, text]) => (
          <button key={id} type="button" class="mp-seg__opt" role="radio" aria-checked={state === id} onClick={() => setState(id)}>
            {text}
          </button>
        ))}
      </div>
      <DataTable
        label="Spots"
        columns={COLUMNS}
        rows={slice}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.place}
        loading={state === "loading"}
        empty={
          <EmptyState icon="/img/icons/papa.png" title="Nadie pegó nada acá… todavía" body="Probá con menos filtros." action={{ label: "Limpiar filtros", onClick: () => setState("data") }} />
        }
        maxHeight={420}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        bulkActions={
          <>
            <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm">
              <Icon name="user" size="sm" />
              Asignar “pegado por”…
            </button>
            <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm">
              <Icon name="eye-off" size="sm" />
              Ocultar
            </button>
          </>
        }
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        toolbar={
          <div style={{ ...wrap, justifyContent: "space-between" }}>
            <div style={wrap}>
              <label class="mp-search mp-search--compact" style={{ width: "300px", maxWidth: "100%" }}>
                <Icon name="search" />
                <input class="mp-input" placeholder="Buscar lugar, persona…" aria-label="Buscar" />
              </label>
              <button type="button" class="mp-chip" aria-pressed={unknownOnly} onClick={() => setUnknownOnly((v) => !v)}>
                Pegado por: ¿?
                <span class="mp-chip__count">156</span>
                <span class="mp-chip__tick">
                  <Icon name="check" />
                </span>
              </button>
            </div>
            <span class="mp-export">
              {["CSV", "GeoJSON", "GeoPackage"].map((fmt) => (
                <button key={fmt} type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={() => toast.show({ message: `Exportando ${fmt}…` })}>
                  <Icon name="download" size="sm" />
                  {fmt}
                </button>
              ))}
            </span>
          </div>
        }
        page={page}
        pageSize={PAGE_SIZE}
        total={state === "empty" ? 0 : ROWS.length}
        onPageChange={setPage}
        shortcuts={[
          { keys: ["A"], label: "aprobar" },
          { keys: ["O"], label: "ocultar" },
          { keys: ["B"], label: "borrar" },
          { keys: ["J", "K"], label: "siguiente / anterior" },
          { keys: ["G"], label: "usar el GPS de la foto" },
          { keys: ["/"], label: "buscar" },
        ]}
      />
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────────────── */

export default function ShellSection() {
  const sample = (e: MouseEvent) => {
    const link = (e.target as Element | null)?.closest("a");
    if (!link) return;
    e.preventDefault();
    toast.show({ message: `Link de muestra: ${link.getAttribute("href") ?? ""}` });
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-12)" }} onClick={sample}>
      <section style={stack}>
        <h2 class="mp-title">Badge</h2>
        <BadgeDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Banner</h2>
        <BannerDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Toast</h2>
        <ToastDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">ProgressBar</h2>
        <ProgressDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">EmptyState</h2>
        <div style={wrap}>
          <div style={phone}>
            <EmptyState card icon="/img/icons/papa.png" title="Nadie pegó nada acá… todavía" body="Probá con menos filtros o mirá otra zona." action={{ label: "Limpiar filtros", onClick: () => toast.show({ message: "Filtros limpios." }) }} />
          </div>
          <div style={phone}>
            <EmptyState card icon="/img/icons/otro.png" title="Este sticker se despegó" body="La página no existe o la borraron." action={{ label: "Volver al mapa", href: "/" }} />
          </div>
        </div>
      </section>
      <section style={stack}>
        <h2 class="mp-title">Skeleton</h2>
        <SkeletonDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Avatar</h2>
        <AvatarDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Flag</h2>
        <FlagDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Polaroid</h2>
        <PolaroidDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">StatSticker</h2>
        <StatDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">Leaderboard</h2>
        <LeaderboardDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">AppHeader</h2>
        <HeaderDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">TabBar</h2>
        <TabBarDemo />
      </section>
      <section style={stack}>
        <h2 class="mp-title">DataTable</h2>
        <DataTableDemo />
      </section>
    </div>
  );
}
