import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/index.css";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { render } from "preact";
import { lazy, Suspense } from "preact/compat";
import { IconSprite } from "./components/Icon";
import { ToastHost } from "./components/Toast";
import { match, path } from "./lib/router";

const KitchenSink = import.meta.env.DEV ? lazy(() => import("./pages/dev/KitchenSink")) : null;

function App() {
  const current = path.value;
  return (
    <>
      <IconSprite />
      <ToastHost />
      {KitchenSink && match("/dev/kitchen-sink", current) ? (
        <Suspense fallback={null}><KitchenSink /></Suspense>
      ) : (
        <h1 class="mp-title">Mapa Papin</h1>
      )}
    </>
  );
}

render(<App />, document.getElementById("app")!);
