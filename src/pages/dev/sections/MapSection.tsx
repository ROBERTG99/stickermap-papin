import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { BottomSheet, type SheetSnap } from "../../../components/BottomSheet";
import { ConfirmDialog, Dialog } from "../../../components/Dialog";
import { Icon } from "../../../components/Icon";
import { Legend } from "../../../components/Legend";
import { Lightbox, type LightboxItem } from "../../../components/Lightbox";
import { MapAttribution, MapControls } from "../../../components/MapControls";
import { MapCluster, MapMarker, MarkerExactDot, createClusterElement, createMarkerElement, setMarkerSelected } from "../../../components/MapMarker";
import { SidePanel } from "../../../components/SidePanel";
import { SpotContent, type SpotView } from "../../../components/SpotContent";
import { StickerCard } from "../../../components/StickerCard";
import { TypeSticker } from "../../../components/map-parts";
import type { StickerType } from "../../../shared/types";

/* ── Sample data (static, Spanish rioplatense) ─────────────────────────── */

function makeType(slug: string, label: string, fit: StickerType["fit"], count: number, order: number): StickerType {
  return { slug, label, icon: `/img/icons/${slug}.png`, color: "var(--brand)", fit, sort_order: order, allows_text: slug === "otro", count };
}

const PAPA = makeType("papa", "Papa", "contain", 44, 1);
const SEXO_PUNTO = makeType("sexo-punto", "Sexo.", "cover", 63, 2);
const SEXO_PREGUNTA = makeType("sexo-pregunta", "Sexo?", "cover", 20, 3);
const SEXO_OG = makeType("sexo-pregunta-og", "Sexo? OG", "cover", 0, 4);
const OTRO = makeType("otro", "Otro", "contain", 35, 5);

const TYPES: StickerType[] = [PAPA, SEXO_PUNTO, SEXO_PREGUNTA, SEXO_OG, OTRO];
const TYPES_3: StickerType[] = [PAPA, SEXO_PUNTO, OTRO];
const TYPES_12: StickerType[] = [
  ...TYPES,
  ...Array.from({ length: 7 }, (_, i) => {
    const base = TYPES[i % TYPES.length] ?? PAPA;
    return makeType(`${base.slug}-${i + 6}`, `Tipo ${i + 6}`, base.fit, 3 + i * 4, i + 6);
  }),
];

const SPOT_VISITOR: SpotView = {
  id: "spot-madrid",
  place: "Puerta del Sol, Madrid",
  country: "España",
  countryCode: "es",
  types: [PAPA, SEXO_PUNTO],
  placers: ["Beto", "Caro"],
  ig: {},
  igPost: null,
  dateLabel: "15 abr 2025",
  photo: null,
  photoVariant: "pole",
  lat: 40.4169,
  lng: -3.7035,
};
const SPOT_OWN: SpotView = {
  id: "spot-montevideo",
  place: "Plaza Independencia, Montevideo",
  country: "Uruguay",
  countryCode: "uy",
  types: [OTRO],
  placers: ["Ana"],
  ig: {},
  igPost: null,
  dateLabel: "hace 1 h",
  photo: null,
  photoVariant: "stone",
  lat: -34.9061,
  lng: -56.1993,
};
const SPOT_UNKNOWN: SpotView = {
  id: "spot-punta",
  place: "Rambla de Punta del Este",
  country: "Uruguay",
  countryCode: "uy",
  types: [OTRO],
  placers: [],
  ig: {},
  igPost: null,
  dateLabel: "30 ago 2024",
  photo: null,
  photoVariant: "sign",
  lat: -34.9606,
  lng: -54.9506,
};
const SPOTS: SpotView[] = [SPOT_VISITOR, SPOT_OWN, SPOT_UNKNOWN];
const ME = "Ana";

const LIGHTBOX_ITEMS: LightboxItem[] = [
  { id: "lb-1", photo: null, place: "Times Square, Nueva York", countryCode: "us", placers: ["Caro"], date: "14 sep 2024", types: [SEXO_PUNTO], placeholderVariant: "night" },
  { id: "lb-2", photo: null, place: "Puerta del Sol, Madrid", countryCode: "es", placers: ["Beto", "Caro"], date: "15 abr 2025", types: [PAPA, SEXO_PUNTO], placeholderVariant: "pole" },
  { id: "lb-3", photo: null, place: "Plaza Independencia, Montevideo", countryCode: "uy", placers: ["Ana"], date: "hace 1 h", types: [OTRO], placeholderVariant: "stone" },
  { id: "lb-4", photo: null, place: "Rambla de Punta del Este", countryCode: "uy", placers: [], date: "30 ago 2024", types: [OTRO], placeholderVariant: "sign" },
  { id: "lb-5", photo: null, place: "Barrio Gótico, Barcelona", countryCode: "es", placers: ["Hugo"], date: "2 jun 2025", types: [PAPA], placeholderVariant: "tiles" },
];

/* ── Layout helpers for the demo only ──────────────────────────────────── */

const STACK = "display:grid;gap:var(--space-4)";
const WRAP = "display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:flex-start";
const MAP_FRAME = "position:relative;overflow:hidden;border-radius:var(--radius-lg);background:var(--map-land);box-shadow:0 0 0 1px var(--line)";
const PHONE_FRAME = `${MAP_FRAME};width:min(390px,100%);height:640px`;

function Block({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section style={STACK}>
      <h2 class="mp-title">{title}</h2>
      {children}
    </section>
  );
}

function Caption({ children }: { children: ComponentChildren }) {
  return <p class="mp-field__hint" style="margin:0">{children}</p>;
}

function MarkerRow({ children, width }: { children: ComponentChildren; width: string }) {
  return (
    <div style={`${MAP_FRAME};width:min(${width},100%);display:flex;align-items:flex-end;justify-content:space-around;gap:var(--space-4);padding:var(--space-8) var(--space-4) var(--space-6)`}>
      {children}
    </div>
  );
}

function markerFor(type: StickerType, id: string, labels: string[], label?: string) {
  return { id, types: labels, iconUrl: type.icon, fit: type.fit, label };
}

/* ── MapMarker ─────────────────────────────────────────────────────────── */

/** The same markers built with the DOM factories MapLibre will use. Click selects one. */
function DomMarkers() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const made: HTMLElement[] = [
      createMarkerElement({ ...markerFor(PAPA, "dom-1", ["Papa"], "Puerta del Sol") }),
      createMarkerElement({ ...markerFor(SEXO_PUNTO, "dom-2", ["Sexo.", "Papa"], "Plaza Mayor"), n: 2 }),
      createMarkerElement({ ...markerFor(SEXO_PREGUNTA, "dom-3", ["Sexo?"]), selected: true }),
      createMarkerElement({ ...markerFor(OTRO, "dom-4", ["Otro"]), small: true }),
      createClusterElement(4),
      createClusterElement(23),
      createClusterElement(56),
    ];
    made.forEach((m) => {
      if (!m.classList.contains("mp-marker")) return;
      m.addEventListener("click", () => {
        made.forEach((o) => o.classList.contains("mp-marker") && setMarkerSelected(o, o === m));
      });
    });
    el.replaceChildren(...made);
    return () => el.replaceChildren();
  }, []);
  return <div ref={host} style="display:flex;align-items:flex-end;justify-content:space-around;gap:var(--space-4);flex-wrap:wrap" />;
}

function MarkerSection() {
  const [selected, setSelected] = useState<string>("m-3");
  const picks = [
    { ...markerFor(PAPA, "m-1", ["Papa"], "Puerta del Sol") },
    { ...markerFor(SEXO_PUNTO, "m-2", ["Sexo.", "Papa"], "Plaza Mayor"), n: 2 },
    { ...markerFor(SEXO_PREGUNTA, "m-3", ["Sexo?"], "Retiro") },
  ];
  return (
    <Block title="MapMarker">
      <div style={WRAP}>
        <MarkerRow width="260px">
          <MapMarker {...markerFor(PAPA, "n-1", ["Papa"])} />
          <MapMarker {...markerFor(SEXO_PUNTO, "n-2", ["Sexo.", "Papa"])} n={2} />
        </MarkerRow>
        <MarkerRow width="200px">
          <MapMarker {...markerFor(SEXO_PREGUNTA, "n-3", ["Sexo?"])} selected />
        </MarkerRow>
        <MarkerRow width="160px">
          <MapMarker {...markerFor(OTRO, "n-4", ["Otro"])} small />
          <MapMarker {...markerFor(PAPA, "n-5", ["Papa"])} small />
        </MarkerRow>
        <div style={`${MAP_FRAME};width:min(260px,100%);display:flex;align-items:center;justify-content:space-around;padding:var(--space-8) var(--space-4)`}>
          <MapCluster count={4} />
          <MapCluster count={23} />
          <MapCluster count={56} />
        </div>
      </div>
      <Caption>Normal · +1 (multi-tipo) · seleccionado · chico (zoom bajo) · clusters 2–9 / 10–49 / 50+ · siempre con el punto exacto</Caption>

      <div style={WRAP}>
        <MarkerRow width="320px">
          <MarkerExactDot {...markerFor(PAPA, "exact-1", ["Papa"])} />
        </MarkerRow>
        <MarkerRow width="320px">
          {picks.map((p) => (
            <MapMarker key={p.id} {...p} selected={selected === p.id} onClick={(id) => setSelected((cur) => (cur === id ? "" : id))} />
          ))}
        </MarkerRow>
        <div style={`${MAP_FRAME};width:min(420px,100%);padding:var(--space-8) var(--space-4) var(--space-6)`}>
          <DomMarkers />
        </div>
      </div>
      <Caption>El punto es la coordenada · tocá un marcador para seleccionarlo (Preact) · el último marco usa createMarkerElement y createClusterElement (DOM, como en MapLibre)</Caption>
    </Block>
  );
}

/* ── Legend ────────────────────────────────────────────────────────────── */

function LegendSection() {
  const [active, setActive] = useState<string | null>(null);
  const activeType = TYPES.find((t) => t.slug === active);
  return (
    <Block title="Legend">
      <div style={WRAP}>
        <Legend types={TYPES} />
        <Legend types={TYPES} defaultCollapsed />
        <div style="display:grid;gap:var(--space-2);justify-items:start">
          <Legend types={TYPES} activeType={active} onToggleType={(slug) => setActive((cur) => (cur === slug ? null : slug))} />
          {activeType ? (
            <div style="display:flex;align-items:center;gap:var(--space-2)">
              <span class="mp-field__hint">{`Mostrando solo ${activeType.label}`}</span>
              <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => setActive(null)}>
                Deshacer
              </button>
            </div>
          ) : (
            <Caption>Tocá un tipo para filtrar</Caption>
          )}
        </div>
        <Legend types={TYPES_3} />
        <Legend types={TYPES_12} />
      </div>
      <Caption>Abierta (desktop por defecto) · cerrada (mobile por defecto) · con filtro · 3 tipos · 12 tipos (la lista scrollea)</Caption>
    </Block>
  );
}

/* ── MapControls ───────────────────────────────────────────────────────── */

function ControlsFrame({ background, initialSatellite }: { background: string; initialSatellite: boolean }) {
  const [satellite, setSatellite] = useState(initialSatellite);
  const [zoom, setZoom] = useState(3);
  const [locating, setLocating] = useState(false);
  const locate = () => {
    setLocating(true);
    setTimeout(() => setLocating(false), 800);
  };
  return (
    <div style={`${MAP_FRAME};background:${background};width:min(300px,100%);height:240px`}>
      <span class="mp-attrib" style="position:absolute;left:var(--space-3);top:var(--space-3)">{`Zoom ${zoom}${locating ? " · buscando…" : ""}`}</span>
      <div style="position:absolute;top:var(--space-3);right:var(--space-3)">
        <MapControls
          satellite={satellite}
          onToggleSatellite={() => setSatellite((s) => !s)}
          onZoomIn={() => setZoom((z) => Math.min(20, z + 1))}
          onZoomOut={() => setZoom((z) => Math.max(0, z - 1))}
          onLocate={locate}
          locating={locating}
        />
      </div>
      <div style="position:absolute;right:6px;bottom:6px">
        <MapAttribution satellite={satellite} />
      </div>
    </div>
  );
}

function ControlsSection() {
  return (
    <Block title="MapControls">
      <div style={WRAP}>
        <ControlsFrame background="var(--map-land)" initialSatellite={false} />
        <ControlsFrame background="var(--brand-ink)" initialSatellite />
      </div>
      <Caption>Zoom · mi ubicación · Satélite (apagado / prendido) · atribución abajo a la derecha</Caption>
    </Block>
  );
}

/* ── StickerCard ───────────────────────────────────────────────────────── */

const CARD_W = "width:min(358px,100%)";

function CardSection() {
  return (
    <Block title="StickerCard">
      <div style={WRAP}>
        <div style={CARD_W}>
          <StickerCard step={1} title="Foto" status="Opcional">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <button type="button" class="mp-typetile" style="padding:18px 8px">
                <Icon name="camera" size="lg" />
                Sacar foto
              </button>
              <button type="button" class="mp-typetile" style="padding:18px 8px">
                <Icon name="image" size="lg" />
                Elegir de galería
              </button>
            </div>
            <p class="mp-field__hint" style="margin:10px 0 0">Opcional, pero sin foto no hay gloria.</p>
          </StickerCard>
        </div>
        <div style={CARD_W}>
          <StickerCard step={1} title="Foto" state="processing" status="…">
            <div style="display:grid;grid-template-columns:112px 1fr;gap:12px;align-items:center">
              <div class="mp-skel" style="aspect-ratio:4/5;border-radius:14px" />
              <div style="display:grid;gap:8px">
                <div class="mp-skel mp-skel--line" style="width:80%" />
                <div class="mp-skel mp-skel--line" style="width:55%" />
                <span class="mp-field__hint">Procesando foto…</span>
              </div>
            </div>
          </StickerCard>
        </div>
        <div style={CARD_W}>
          <StickerCard step={1} title="Foto" state="done">
            <div style="display:grid;grid-template-columns:112px 1fr;gap:12px;align-items:center">
              <div style="border-radius:14px;overflow:hidden">
                <div class="mp-photo mp-photo--tiles" style="--tilt:var(--tilt-1)" role="img" aria-label="Foto: sticker Papa">
                  <TypeSticker type={PAPA} />
                </div>
              </div>
              <div style="display:grid;gap:6px;justify-items:start">
                <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm">
                  <Icon name="rotate" size="sm" />
                  Rotar
                </button>
                <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm">
                  <Icon name="image" size="sm" />
                  Cambiar
                </button>
                <button type="button" class="mp-btn mp-btn--danger-ghost mp-btn--sm">
                  <Icon name="trash" size="sm" />
                  Quitar
                </button>
              </div>
            </div>
          </StickerCard>
        </div>
        <div style={CARD_W}>
          <StickerCard step={3} title="¿Qué sticker?" state="invalid" status="Falta" error="Elegí al menos un tipo de sticker." />
        </div>
      </div>
      <Caption>Vacía · procesando (shimmer) · lista (rotar / cambiar / quitar) · con error</Caption>
    </Block>
  );
}

/* ── BottomSheet ───────────────────────────────────────────────────────── */

function SheetFrame({ spot, initialSnap, hours, onOpenPhoto, caption }: { spot: SpotView; initialSnap: SheetSnap; hours?: number; onOpenPhoto: () => void; caption: string }) {
  const [open, setOpen] = useState(true);
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const [note, setNote] = useState("");
  return (
    <div style="display:grid;gap:var(--space-2);width:min(390px,100%)">
      <div style={PHONE_FRAME}>
        <div style="padding:var(--space-4);display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap">
          {!open && (
            <button
              type="button"
              class="mp-btn mp-btn--secondary mp-btn--sm"
              onClick={() => {
                setSnap(initialSnap);
                setOpen(true);
              }}
            >
              Abrir sheet
            </button>
          )}
          {note && <span class="mp-attrib">{note}</span>}
        </div>
        <BottomSheet open={open} snap={snap} onSnapChange={setSnap} onClose={() => setOpen(false)} title={spot.place} aboveTabBar={false}>
          <SpotContent
            spot={spot}
            variant={snap === "peek" ? "peek" : "full"}
            me={ME}
            editHoursLeft={hours}
            onOpenPhoto={onOpenPhoto}
            onShare={() => setNote("Compartir")}
            onReport={() => setNote("Reportar")}
            onEdit={() => setNote("Editar")}
          />
        </BottomSheet>
      </div>
      <Caption>{caption}</Caption>
    </div>
  );
}

function SheetSection({ onOpenPhoto }: { onOpenPhoto: () => void }) {
  return (
    <Block title="BottomSheet">
      <div style={WRAP}>
        <SheetFrame spot={SPOT_VISITOR} initialSnap="peek" onOpenPhoto={onOpenPhoto} caption="Peek (176px, region): tocá o arrastrá hacia arriba para expandir; arrastrá hacia abajo para cerrar." />
        <SheetFrame spot={SPOT_VISITOR} initialSnap="expanded" onOpenPhoto={onOpenPhoto} caption="Expandida, visitante (dialog): Esc o arrastrar abajo vuelve a peek; la foto abre el lightbox." />
        <SheetFrame spot={SPOT_OWN} initialSnap="expanded" hours={23} onOpenPhoto={onOpenPhoto} caption="Tu sticker: Editar solo para quien lo cargó, con cuenta regresiva." />
        <SheetFrame spot={SPOT_UNKNOWN} initialSnap="expanded" onOpenPhoto={onOpenPhoto} caption="Sin dueño (legado): Pegado por ¿?" />
      </div>
    </Block>
  );
}

/* ── SidePanel ─────────────────────────────────────────────────────────── */

function PanelSection({ onOpenPhoto }: { onOpenPhoto: () => void }) {
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const spot = SPOTS[i] ?? SPOT_VISITOR;
  return (
    <Block title="SidePanel">
      <div style={`${MAP_FRAME};display:grid;justify-items:end;align-items:stretch;padding:var(--space-4);height:760px;width:min(440px,100%)`}>
        {!open && (
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" style="justify-self:start;align-self:start" onClick={() => setOpen(true)}>
            Abrir panel
          </button>
        )}
        {open && (
          <SidePanel
            title={spot.place}
            floating={false}
            onClose={() => setOpen(false)}
            onPrev={() => setI((cur) => Math.max(0, cur - 1))}
            onNext={() => setI((cur) => Math.min(SPOTS.length - 1, cur + 1))}
          >
            <SpotContent spot={spot} variant="full" me={ME} editHoursLeft={spot.id === SPOT_OWN.id ? 23 : undefined} onOpenPhoto={onOpenPhoto} />
          </SidePanel>
        )}
      </div>
      <Caption>Desktop: 400px a la derecha · Esc o X cierra · flechas izquierda y derecha cambian de spot</Caption>
    </Block>
  );
}

/* ── Dialog ────────────────────────────────────────────────────────────── */

function DuplicateArt() {
  return (
    <>
      <div style="width:64px;border-radius:10px;overflow:hidden">
        <div class="mp-photo mp-photo--pole" style="--tilt:var(--tilt-1)" role="img" aria-label="Foto: sticker Papa">
          <TypeSticker type={PAPA} />
        </div>
      </div>
      <div>
        <b style="color:var(--ink-strong)">Madrid</b> · Papa
        <br />
        <span class="mp-field__hint">cargado por Beto, 15 abr 2025</span>
      </div>
    </>
  );
}

function DialogFrame({ children, width, caption }: { children: ComponentChildren; width: string; caption: string }) {
  return (
    <div style={`display:grid;gap:var(--space-2);width:min(${width},100%)`}>
      <div style={`${MAP_FRAME};height:420px`}>{children}</div>
      <Caption>{caption}</Caption>
    </div>
  );
}

function DialogSection() {
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState("");
  return (
    <Block title="Dialog">
      <div style={WRAP}>
        <DialogFrame width="390px" caption="Foto repetida (dialog, hoja modal en mobile)">
          <Dialog
            open
            contained
            interactive={false}
            layout="sheet"
            title="Esta foto ya está en el mapa"
            art={<DuplicateArt />}
            onClose={() => undefined}
            actions={
              <>
                <button type="button" class="mp-btn mp-btn--primary">Agregar sticker a ese lugar</button>
                <button type="button" class="mp-btn mp-btn--secondary">No, es otro lugar</button>
              </>
            }
          >
            ¿Es otro sticker en la misma foto?
          </Dialog>
        </DialogFrame>
        <DialogFrame width="390px" caption="Confirmar borrado (alertdialog): lo recomendado primero, Mejor no para salir">
          <ConfirmDialog
            open
            contained
            interactive={false}
            layout="sheet"
            danger
            title="¿Borrar este sticker?"
            body="Se va del mapa y de los rankings. No hay vuelta atrás."
            confirmLabel="Borrar sticker"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </DialogFrame>
        <DialogFrame width="520px" caption="Desktop: centrado, 440px como máximo">
          <ConfirmDialog
            open
            contained
            interactive={false}
            layout="centered"
            danger
            title="¿Borrar este sticker?"
            body="Se va del mapa y de los rankings. No hay vuelta atrás."
            confirmLabel="Borrar sticker"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </DialogFrame>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <button type="button" class="mp-btn mp-btn--secondary" onClick={() => setAsking(true)}>
          <Icon name="trash" />
          Probar el diálogo de verdad
        </button>
        {result && <span class="mp-field__hint">{result}</span>}
      </div>
      <ConfirmDialog
        open={asking}
        danger
        title="¿Borrar este sticker?"
        body="Se va del mapa y de los rankings. No hay vuelta atrás."
        confirmLabel="Borrar sticker"
        onConfirm={() => {
          setAsking(false);
          setResult("Borrado (de mentira)");
        }}
        onCancel={() => {
          setAsking(false);
          setResult("Mejor no");
        }}
      />
    </Block>
  );
}

/* ── Lightbox ──────────────────────────────────────────────────────────── */

function LightboxSection({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState("");
  return (
    <Block title="Lightbox">
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <button type="button" class="mp-btn mp-btn--secondary" onClick={onOpen}>
          <Icon name="expand" />
          Abrir a pantalla completa
        </button>
        {!open && (
          <button type="button" class="mp-btn mp-btn--secondary" onClick={() => setOpen(true)}>
            Abrir en el marco
          </button>
        )}
        {note && <span class="mp-field__hint">{note}</span>}
      </div>
      <div data-theme="dark" class="mp-themed" style="position:relative;overflow:hidden;border-radius:var(--radius-xl);width:min(390px,100%);height:720px">
        {open && (
          <Lightbox
            contained
            interactive={false}
            items={LIGHTBOX_ITEMS}
            index={index}
            onPrev={() => setIndex((cur) => Math.max(0, cur - 1))}
            onNext={() => setIndex((cur) => Math.min(LIGHTBOX_ITEMS.length - 1, cur + 1))}
            onClose={() => setOpen(false)}
            onShare={() => setNote("Compartir")}
          />
        )}
      </div>
      <Caption>Deslizá a los costados por los spots cercanos · pellizcá o doble tap para hacer zoom (el aviso se va con el primero) · X, Esc o deslizar hacia abajo cierra</Caption>
    </Block>
  );
}

/* ── Section ───────────────────────────────────────────────────────────── */

export default function MapSection() {
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const openLightbox = () => {
    setLightboxIndex(0);
    setLightbox(true);
  };
  return (
    <div style="display:grid;gap:var(--space-12)">
      <MarkerSection />
      <LegendSection />
      <ControlsSection />
      <CardSection />
      <SheetSection onOpenPhoto={openLightbox} />
      <PanelSection onOpenPhoto={openLightbox} />
      <DialogSection />
      <LightboxSection onOpen={openLightbox} />
      {lightbox && (
        <Lightbox
          items={LIGHTBOX_ITEMS}
          index={lightboxIndex}
          onPrev={() => setLightboxIndex((cur) => Math.max(0, cur - 1))}
          onNext={() => setLightboxIndex((cur) => Math.min(LIGHTBOX_ITEMS.length - 1, cur + 1))}
          onClose={() => setLightbox(false)}
          onShare={() => undefined}
        />
      )}
    </div>
  );
}
