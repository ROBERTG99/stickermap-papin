import { Hono, type Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./app";
import { runGeocodeCron } from "./cron/geocode";
import { flipStaleSpots } from "./lib/life";
import type { Env } from "./env";
import { ogTags, spotOg } from "./lib/og";
import { admin } from "./routes/admin";
import { batches } from "./routes/batches";
import { catalog } from "./routes/catalog";
import { img } from "./routes/img";
import { media } from "./routes/media";
import { spots } from "./routes/spots";

const DAILY_CRON = "0 4 * * *";

const app = new Hono<AppEnv>();

/** Responses from the ASSETS binding have immutable headers; copy so the security-headers middleware can add its own. */
const mutable = (res: Response) => new Response(res.body, res);

// Same policy as src/public/_headers (static assets are served without running the Worker).
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "blob:", "https://tiles.openfreemap.org", "https://tiles.maps.eox.at"],
    connectSrc: ["'self'", "https://tiles.openfreemap.org", "https://tiles.maps.eox.at", "https://photon.komoot.io", "https://nominatim.openstreetmap.org", "https://challenges.cloudflare.com"],
    scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
    mediaSrc: ["'self'", "blob:"],
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
app.route("/media", media);

// On workers.dev Cloudflare Access can only protect a whole Worker, so /admin lives in a second Worker (stickermap-admin)
// and the public one just points there. On the admin Worker (no ADMIN_ORIGIN) the SPA is served from the assets.
app.all("/admin", (c) => adminEntry(c));
app.all("/admin/*", (c) => adminEntry(c));
function adminEntry(c: Context<AppEnv>) {
  if (c.env.ADMIN_ORIGIN) {
    const url = new URL(c.req.url);
    return c.redirect(`${c.env.ADMIN_ORIGIN}${url.pathname}${url.search}`, 302);
  }
  return c.env.ASSETS.fetch(c.req.raw).then(mutable);
}

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
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // every minute: reverse geocoding (<= 4 requests); once a day: spots nobody has seen for 12 months become "sin noticias"
    if (event.cron === DAILY_CRON) ctx.waitUntil(flipStaleSpots(env.DB));
    else ctx.waitUntil(runGeocodeCron(env));
  },
} satisfies ExportedHandler<Env>;
