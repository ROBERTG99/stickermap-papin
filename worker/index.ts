import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./app";
import { runGeocodeCron } from "./cron/geocode";
import type { Env } from "./env";
import { ogTags, spotOg } from "./lib/og";
import { admin } from "./routes/admin";
import { batches } from "./routes/batches";
import { catalog } from "./routes/catalog";
import { img } from "./routes/img";
import { spots } from "./routes/spots";

const app = new Hono<AppEnv>();

/** Responses from the ASSETS binding have immutable headers; copy so the security-headers middleware can add its own. */
const mutable = (res: Response) => new Response(res.body, res);

// Same policy as src/public/_headers (static assets are served without running the Worker).
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "blob:", "https://tiles.openfreemap.org", "https://*.s2maps.eu"],
    connectSrc: ["'self'", "https://tiles.openfreemap.org", "https://photon.komoot.io", "https://nominatim.openstreetmap.org", "https://challenges.cloudflare.com"],
    scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
    frameSrc: ["https://challenges.cloudflare.com"],
    workerSrc: ["'self'", "blob:"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
  referrerPolicy: "strict-origin-when-cross-origin",
  xContentTypeOptions: "nosniff",
}));

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/spots", spots);
app.route("/api/batches", batches);
app.route("/api/admin", admin);
app.route("/api", catalog);
app.route("/img", img);

app.get("/s/:id", async (c) => {
  const page = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
  const spot = await spotOg(c.env, c.req.param("id"));
  if (!spot) return mutable(page);
  const { title, tags } = ogTags(new URL(c.req.url).origin, spot);
  return new HTMLRewriter()
    .on("title", { element: (el) => { el.setInnerContent(title); } })
    .on("head", { element: (el) => { el.append(tags, { html: true }); } })
    .transform(page);
});

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not_found" }, 404) : c.env.ASSETS.fetch(c.req.raw).then(mutable)));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runGeocodeCron(env));
  },
} satisfies ExportedHandler<Env>;
