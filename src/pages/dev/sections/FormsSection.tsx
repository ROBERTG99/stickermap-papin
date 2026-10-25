import { useEffect, useRef, useState } from "preact/hooks";
import { Button, IconButton } from "../../../components/Button";
import {
  AddChip,
  CountBadge,
  FilterButton,
  FilterChip,
  PersonChip,
  RemovablePersonChip,
  TypeChip,
  TypeGrid,
  type TypeTileOption,
} from "../../../components/Chip";
import { Fab } from "../../../components/Fab";
import { Combobox, SearchField, SwitchRow, TextAreaField, TextField, type SearchResult } from "../../../components/Field";
import { Segmented } from "../../../components/Segmented";
import type { PersonSummary } from "../../../shared/types";

/* ── Sample data (Spanish, static) ───────────────────────────────────────── */

const TYPES: TypeTileOption[] = [
  { slug: "papa", label: "Papa", icon: "/img/icons/papa.png", fit: "contain", allows_text: false },
  { slug: "sexo-punto", label: "Sexo.", icon: "/img/icons/sexo-punto.png", fit: "cover", allows_text: false },
  { slug: "sexo-pregunta", label: "Sexo?", icon: "/img/icons/sexo-pregunta.png", fit: "cover", allows_text: false },
  { slug: "sexo-pregunta-og", label: "Sexo? OG", icon: "/img/icons/sexo-pregunta-og.png", fit: "cover", allows_text: false },
  { slug: "otro", label: "Otro", icon: "/img/icons/otro.png", fit: "contain", allows_text: true },
];
const TYPE_COUNTS: Record<string, number> = { papa: 44, "sexo-punto": 63, "sexo-pregunta": 20, "sexo-pregunta-og": 0, otro: 35 };

const PEOPLE: PersonSummary[] = [
  { name: "Ana", placed: 46, reported: 46 },
  { name: "Beto", placed: 21, reported: 21 },
  { name: "Dani", placed: 11, reported: 11 },
  { name: "Marcos", placed: 1, reported: 1 },
  { name: "Gus", placed: 4, reported: 4 },
  { name: "Eli", placed: 5, reported: 5 },
  { name: "Caro", placed: 5, reported: 5 },
  { name: "Fede", placed: 5, reported: 5 },
  { name: "Hugo", placed: 1, reported: 1 },
];
const COMBO_OPTIONS = PEOPLE.map((p) => ({ name: p.name, count: p.placed }));

const PLACES: SearchResult[] = [
  { id: "1", label: "Ciudad Vieja, Montevideo", meta: "Uruguay" },
  { id: "2", label: "Pocitos, Montevideo", meta: "Uruguay" },
  { id: "3", label: "Palermo, Buenos Aires", meta: "Argentina" },
  { id: "4", label: "Lavapiés, Madrid", meta: "España" },
  { id: "5", label: "Mercado de San Miguel, Madrid", meta: "España" },
  { id: "6", label: "Plaza Independencia, Montevideo", meta: "Uruguay" },
];

/* ── Section ─────────────────────────────────────────────────────────────── */

export default function FormsSection() {
  return (
    <div class="mp-stack">
      <ButtonDemo />
      <FabDemo />
      <SegmentedDemo />
      <ChipDemo />
      <FieldDemo />
    </div>
  );
}

function ButtonDemo() {
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function send() {
    setLoading(true);
    timer.current = window.setTimeout(() => setLoading(false), 1800);
  }
  return (
    <section class="mp-stack" aria-labelledby="forms-button">
      <h2 class="mp-title" id="forms-button">
        Button
      </h2>
      <div class="mp-chips">
        <Button variant="primary" icon="check">
          Aprobar
        </Button>
        <Button variant="secondary" icon="share">
          Compartir
        </Button>
        <Button variant="ghost">Agregar otro</Button>
        <Button variant="danger" icon="trash">
          Borrar sticker
        </Button>
        <Button variant="danger-ghost">Borrar</Button>
        <Button variant="quiet" icon="flag">
          Reportar
        </Button>
      </div>
      <div class="mp-chips">
        <Button variant="primary" size="lg">
          Mandale Mecha
        </Button>
        <Button variant="primary" size="lg" disabled>
          Mandale Mecha
        </Button>
        <Button variant="primary" size="lg" loading>
          Subiendo…
        </Button>
        <IconButton icon="x" label="Cerrar" />
        <Button variant="secondary" size="sm" icon="pencil">
          Editar
        </Button>
      </div>
      <p class="mp-field__label">Con estado (tocá para probar la carga)</p>
      <Button variant="primary" size="lg" block loading={loading} onClick={send}>
        {loading ? "Subiendo…" : "Mandale Mecha"}
      </Button>
      <span class="mp-field__hint">Falta: tipo de sticker y ubicación.</span>
    </section>
  );
}

function FabDemo() {
  return (
    <section class="mp-stack" aria-labelledby="forms-fab">
      <h2 class="mp-title" id="forms-fab">
        Fab
      </h2>
      <div class="mp-chips">
        <Fab href="#/nuevo" />
        <Fab href="#/nuevo" round />
      </div>
      <span class="mp-field__hint">Extendido (por defecto) · redondo solo si el espacio no alcanza (hasta 340px de ancho).</span>
    </section>
  );
}

function SegmentedDemo() {
  const [who, setWho] = useState<"yo" | "otros" | "nose">("yo");
  const [ranking, setRanking] = useState<"pegados" | "cargados">("cargados");
  return (
    <section class="mp-stack" aria-labelledby="forms-segmented">
      <h2 class="mp-title" id="forms-segmented">
        Segmented
      </h2>
      <div class="mp-stack">
        <span class="mp-field__label" id="forms-sg1">
          ¿Quién lo pegó?
        </span>
        <Segmented
          labelledBy="forms-sg1"
          value={who}
          onChange={setWho}
          options={[
            { value: "yo", label: "Yo" },
            { value: "otros", label: "Otro/s" },
            { value: "nose", label: "No sé" },
          ]}
        />
      </div>
      <div class="mp-stack">
        <span class="mp-field__label" id="forms-sg2">
          Ranking
        </span>
        <Segmented
          labelledBy="forms-sg2"
          value={ranking}
          onChange={setRanking}
          options={[
            { value: "pegados", label: "Más pegados" },
            { value: "cargados", label: "Más cargados" },
          ]}
        />
      </div>
      <span class="mp-field__hint">Flechas del teclado mueven la selección.</span>
    </section>
  );
}

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function ChipDemo() {
  const [types, setTypes] = useState<string[]>(["papa", "sexo-pregunta"]);
  const [people, setPeople] = useState<string[]>(["Beto"]);
  const [chosen, setChosen] = useState<string[]>(["Ana", "Dani"]);
  const [countries, setCountries] = useState<string[]>(["es"]);
  const [thisMonth, setThisMonth] = useState(false);
  const [tiles, setTiles] = useState<string[]>(["papa", "sexo-punto"]);
  const [otherText, setOtherText] = useState("");
  const activeFilters = types.length + people.length + countries.length + (thisMonth ? 1 : 0);

  return (
    <section class="mp-stack" aria-labelledby="forms-chip">
      <h2 class="mp-title" id="forms-chip">
        Chip
      </h2>

      <p class="mp-field__label">Tipo: seleccionado, no seleccionado y deshabilitado (0)</p>
      <div class="mp-chips">
        {TYPES.map((t, i) => (
          <TypeChip key={t.slug} type={t} index={i} count={TYPE_COUNTS[t.slug]} selected={types.includes(t.slug)} onToggle={(s) => setTypes((l) => toggle(l, s))} />
        ))}
      </div>
      <p class="mp-field__label">En una sola fila con scroll</p>
      <div class="mp-chips mp-chips--scroll">
        {TYPES.map((t, i) => (
          <TypeChip key={t.slug} type={t} index={i} count={TYPE_COUNTS[t.slug]} selected={types.includes(t.slug)} onToggle={(s) => setTypes((l) => toggle(l, s))} />
        ))}
      </div>

      <p class="mp-field__label">Persona: toggle, quitable y agregar</p>
      <div class="mp-chips">
        <PersonChip name="Beto" index={0} selected={people.includes("Beto")} onToggle={(n) => setPeople((l) => toggle(l, n))} />
        <PersonChip name="Caro" index={1} selected={people.includes("Caro")} onToggle={(n) => setPeople((l) => toggle(l, n))} />
        {chosen.map((name, i) => (
          <RemovablePersonChip key={name} name={name} index={i + 2} isSelf={name === "Ana"} onRemove={(n) => setChosen((l) => l.filter((x) => x !== n))} />
        ))}
        <AddChip onClick={() => setChosen((l) => (l.includes("Eli") ? l : [...l, "Eli"]))} />
      </div>

      <p class="mp-field__label">Filtro de texto y botón de filtros con contador</p>
      <div class="mp-chips">
        <FilterChip label="Uruguay" flag="uy" count={19} selected={countries.includes("uy")} onToggle={() => setCountries((l) => toggle(l, "uy"))} />
        <FilterChip label="España" flag="es" count={9} selected={countries.includes("es")} onToggle={() => setCountries((l) => toggle(l, "es"))} />
        <FilterChip label="Este mes" selected={thisMonth} onToggle={() => setThisMonth((v) => !v)} />
        <FilterButton count={activeFilters} onClick={() => setTypes([])} />
        <CountBadge>{activeFilters}</CountBadge>
      </div>
      <span class="mp-field__hint">El botón de filtros limpia los tipos al tocarlo.</span>

      <p class="mp-field__label">Tile de tipo (formulario): multi-selección; “Otro” pide “¿Cuál?”</p>
      <TypeGrid types={TYPES} value={tiles} onChange={setTiles} otherText={otherText} onOtherTextChange={setOtherText} />
      <p class="mp-field__label">Con error</p>
      <TypeGrid types={TYPES} value={["otro"]} onChange={() => undefined} otherText="" onOtherTextChange={() => undefined} otherError="Contanos cuál es el “Otro”." />
    </section>
  );
}

function FieldDemo() {
  const [link, setLink] = useState("maps.app.goo.gl/x7Qz…");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState("");
  const [note, setNote] = useState("Arriba del secamanos, al lado del espejo.");
  const [approx, setApprox] = useState(true);
  const [soy, setSoy] = useState("Ana");
  const [others, setOthers] = useState<string[]>(["Caro"]);
  const [which, setWhich] = useState("");

  function search(q: string) {
    const n = q.toLowerCase();
    setResults(n ? PLACES.filter((p) => p.label.toLowerCase().includes(n)) : []);
  }

  return (
    <section class="mp-stack" aria-labelledby="forms-field">
      <h2 class="mp-title" id="forms-field">
        Field
      </h2>

      <TextField label="Pegar link o coordenadas" mono value={link} onInput={(e) => setLink(e.currentTarget.value)} ok="-34.9061, -56.1993" />
      <TextField label="Nombre del lugar" placeholder="Ej: Café de la esquina" hint="Opcional. Lo usamos para encontrarlo más rápido." />
      <TextField
        label="¿Cuál?"
        placeholder="Ej: el de la vaca"
        value={which}
        onInput={(e) => setWhich(e.currentTarget.value)}
        error="Contanos cuál es el “Otro”."
      />

      <SearchField
        label="Buscar lugar"
        placeholder="Buscar lugar o dirección"
        value={query}
        onValueChange={setQuery}
        onSearch={search}
        results={results}
        onSelect={(r) => {
          setQuery(r.label);
          setPicked(r.label);
          setResults([]);
        }}
      />
      <span class="mp-field__hint">{picked ? `Elegiste: ${picked}` : "Probá con “Madrid” o “Montevideo” (espera 300 ms, muestra 5)."}</span>
      <SearchField label="Buscar en el mapa" placeholder="Buscar" compact value="" onValueChange={() => undefined} />

      <Combobox
        label="Soy:"
        inputLabel="Cambiar nombre"
        placeholder="Tu nombre (opcional)"
        options={COMBO_OPTIONS}
        value={soy ? [soy] : []}
        onChange={(v) => setSoy(v[0] ?? "")}
        multiple={false}
        allowCreate
        selfName={soy}
        hint={soy ? "Lo recordamos para la próxima." : "Si lo dejás vacío, figurás como Anónimo."}
      />
      <Combobox
        label="Otras personas"
        placeholder="Agregar nombre"
        options={COMBO_OPTIONS}
        value={others}
        onChange={setOthers}
        allowCreate
      />

      <TextAreaField label="Nota" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      <SwitchRow label="Ubicación aproximada" description="Redondea a ~100 m. Para casas." checked={approx} onChange={setApprox} />
    </section>
  );
}
