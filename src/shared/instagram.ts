/** Instagram handles and post links (BUILD.md §19, F2). Plain data that links out: no Instagram API, no embeds. */

const HANDLE = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/;
const POST = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i;

/** `@Chimbo.Papin ` -> `chimbo.papin`; null when it is not a valid handle. Empty input is "no handle" (null). */
export function normalizeHandle(raw: string | null | undefined): string | null {
  const h = (raw ?? "").trim().replace(/^@+/, "");
  return HANDLE.test(h) ? h.toLowerCase() : null;
}

/** `instagram.com/reel/C8xQ2p?igsh=1` -> `https://www.instagram.com/reel/C8xQ2p/`; null when it is not a post, reel or tv link. */
export function normalizePostUrl(raw: string | null | undefined): string | null {
  const m = POST.exec((raw ?? "").trim());
  return m ? `https://www.instagram.com/${m[1]!.toLowerCase()}/${m[2]}/` : null;
}

export const postKind = (url: string): "reel" | "post" => (url.includes("/reel/") ? "reel" : "post");
export const profileUrl = (handle: string): string => `https://instagram.com/${handle}`;
