import AddSection from "./sections/AddSection";
import FormsSection from "./sections/FormsSection";
import MapSection from "./sections/MapSection";
import ShellSection from "./sections/ShellSection";

/** Dev-only page that renders every design-system component in every state (/dev/kitchen-sink). */
export default function KitchenSink() {
  const toggleTheme = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  };
  return (
    <div class="ks">
      <nav class="ks-nav" aria-label="Secciones">
        <a href="#forms">Formularios</a>
        <a href="#add">Agregar</a>
        <a href="#map">Mapa</a>
        <a href="#shell">Shell</a>
        <button type="button" class="mp-btn mp-btn--sm mp-btn--secondary" onClick={toggleTheme}>Tema</button>
      </nav>
      <div id="forms"><FormsSection /></div>
      <div id="add"><AddSection /></div>
      <div id="map"><MapSection /></div>
      <div id="shell"><ShellSection /></div>
    </div>
  );
}
