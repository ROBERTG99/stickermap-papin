import type { Env } from "../env";

interface OgSpot { id: string; place_name: string | null; country: string | null; photo_key: string | null; labels: string }

/** Open Graph / Twitter tags for /s/:id so shared links preview nicely in WhatsApp (BUILD.md §7.2). */
export async function spotOg(env: Env, id: string): Promise<OgSpot | null> {
  const row = await env.DB.prepare("SELECT id, place_name, country, photo_key FROM spots WHERE id = ?1 AND status = 'published'").bind(id).first<Omit<OgSpot, "labels">>();
  if (!row) return null;
  const { results } = await env.DB.prepare("SELECT t.label FROM spot_types st JOIN sticker_types t ON t.slug = st.type_slug WHERE st.spot_id = ?1 ORDER BY t.sort_order").bind(id).all<{ label: string }>();
  return { ...row, labels: results.map((r) => r.label).join(" + ") };
}

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export function ogTags(origin: string, spot: OgSpot): { title: string; tags: string } {
  const where = [spot.place_name, spot.country].filter((v, i, a) => !!v && a.indexOf(v) === i).join(", ");
  const title = `${spot.labels || "Sticker"}${where ? ` en ${where}` : ""} · Mapa Papin`;
  const description = "Mapa global de los stickers papines";
  const url = `${origin}/s/${spot.id}`;
  const image = spot.photo_key ? `${origin}/img/${spot.photo_key}` : `${origin}/img/icons/papa.png`;
  const tags = [
    ["og:type", "website"], ["og:site_name", "Mapa Papin"], ["og:title", title], ["og:description", description], ["og:url", url], ["og:image", image],
  ].map(([p, v]) => `<meta property="${p}" content="${esc(v!)}" />`).join("") +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" /><meta name="twitter:image" content="${esc(image)}" />`;
  return { title, tags };
}
