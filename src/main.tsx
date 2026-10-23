import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/index.css";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { render } from "preact";
import { App } from "./App";
import { registerServiceWorker } from "./lib/pwa";

registerServiceWorker();
render(<App />, document.getElementById("app")!);
