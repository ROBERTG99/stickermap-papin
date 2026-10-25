import type { StickerType } from "../shared/types";
import { formatNumber } from "./format";
import { t } from "./i18n";
import { worldLaps, type GroupYear, type PersonYear } from "./wrapped";

export type WrappedTheme = "brand" | "mint" | "butter" | "ink" | "die";

/** One story card, the same data for the on-screen deck and for the 1080×1920 export. */
export interface WrappedCard {
  id: string;
  theme: WrappedTheme;
  kicker: string;
  big: string;
  title: string;
  text?: string;
  /** Sticker icon to draw large (favourite type). */
  icon?: { url: string; fit: "cover" | "contain" };
  /** ISO country codes shown as flags under the text. */
  flags?: string[];
  /** Accessible name of the whole card. */
  aria: string;
}

const n = (v: number) => formatNumber(v);
const monthName = (m: number) => t(`wrapped.months.${m}`);

/** Up to `max` country names, then "y N más" is not needed: four is what fits a card. */
const joinNames = (names: string[], max = 4) => names.slice(0, max).join(", ");

export function personCards(py: PersonYear, types: readonly StickerType[], now = Date.now()): WrappedCard[] {
  const name = py.person;
  const placed = py.placed.length;
  const typeOf = (slug: string) => types.find((x) => x.slug === slug);
  const cards: WrappedCard[] = [];

  cards.push({
    id: "year", theme: "brand", kicker: t("wrapped.p.year.kicker"), big: n(placed), title: t("wrapped.p.year.title"),
    text: t(py.countries.length === 1 ? "wrapped.p.year.textOne" : "wrapped.p.year.text", { c: py.countries.length, name }),
    aria: t("wrapped.p.year.aria", { n: placed }),
  });

  const km = Math.round(py.km);
  cards.push({
    id: "km", theme: "mint", kicker: t("wrapped.p.km.kicker"), big: n(km), title: t("wrapped.p.km.title"),
    text: km === 0 ? t("wrapped.p.km.textNone") : km < 1000 ? t("wrapped.p.km.textShort") : t("wrapped.p.km.text", { laps: formatNumber(worldLaps(py.km), 1) }),
    aria: t("wrapped.p.km.aria", { km: n(km) }),
  });

  const fresh = py.newCountries;
  cards.push({
    id: "countries", theme: "butter", kicker: t("wrapped.p.countries.kicker"),
    big: fresh.length ? n(fresh.length) : "0",
    title: fresh.length ? joinNames(fresh.map((c) => c.name)) : t("wrapped.p.countries.none"),
    text: fresh.length ? t(fresh.length === 1 ? "wrapped.p.countries.textOne" : "wrapped.p.countries.text") : t("wrapped.p.countries.noneText"),
    flags: fresh.slice(0, 6).map((c) => c.code), aria: t("wrapped.p.countries.aria", { n: fresh.length }),
  });

  const fav = py.favorite ? typeOf(py.favorite.slug) : undefined;
  cards.push({
    id: "favorite", theme: "die", kicker: t("wrapped.p.favorite.kicker"), big: py.favorite ? n(py.favorite.count) : "0",
    title: t("wrapped.p.favorite.title", { type: fav?.label ?? py.favorite?.slug ?? "—" }), text: t("wrapped.p.favorite.text"),
    icon: fav ? { url: fav.icon, fit: fav.fit } : undefined, aria: t("wrapped.p.favorite.aria", { type: fav?.label ?? "", n: py.favorite?.count ?? 0 }),
  });

  const far = py.farthest;
  cards.push({
    id: "farthest", theme: "ink", kicker: t("wrapped.p.farthest.kicker"), big: far ? n(Math.round(far.km)) : "0",
    title: t("wrapped.p.farthest.title", { place: far?.spot.place?.split(",").at(-1)?.trim() || far?.spot.country || "—" }), text: t("wrapped.p.farthest.text"),
    aria: t("wrapped.p.farthest.aria", { place: far?.spot.place ?? "", km: far ? n(Math.round(far.km)) : 0 }),
  });

  const long = py.longest;
  cards.push({
    id: "longest", theme: "brand", kicker: t("wrapped.p.longest.kicker"), big: long ? n(long.days) : "0",
    title: t(long?.alive ? "wrapped.p.longest.titleAlive" : "wrapped.p.longest.title"), text: t("wrapped.p.longest.text", { place: long?.spot.place ?? long?.spot.country ?? "" }),
    aria: t("wrapped.p.longest.aria", { days: long?.days ?? 0 }),
  });
  void now;

  cards.push({
    id: "rank", theme: "mint", kicker: t("wrapped.p.rank.kicker"), big: `#${py.rank}`, title: t("wrapped.p.rank.title", { n: py.people }),
    text: py.people <= 1 ? t("wrapped.p.rank.textAlone") : py.rival ? t("wrapped.p.rank.text", { name: py.rival.name, gap: py.rival.gap }) : t("wrapped.p.rank.textFirst"),
    aria: t("wrapped.p.rank.aria", { rank: py.rank, n: py.people }),
  });

  cards.push({
    id: "summary", theme: "ink", kicker: t("wrapped.p.summary.kicker"), big: n(placed), title: t("wrapped.p.summary.title", { c: py.countries.length }),
    text: t("wrapped.p.summary.text", { km: n(km), rank: py.rank }), aria: t("wrapped.p.summary.aria"),
  });
  return cards;
}

export function groupCards(gy: GroupYear): WrappedCard[] {
  const fresh = gy.newCountries;
  return [
    { id: "total", theme: "brand", kicker: t("wrapped.g.total.kicker"), big: n(gy.total), title: t("wrapped.g.total.title"), text: t("wrapped.g.total.text", { c: gy.countries }), aria: t("wrapped.g.total.aria", { n: gy.total }) },
    {
      id: "countries", theme: "butter", kicker: t("wrapped.g.countries.kicker"), big: n(fresh.length), title: fresh.length ? joinNames(fresh.map((c) => c.name)) : t("wrapped.g.countries.none"),
      text: fresh.length ? t(fresh.length === 1 ? "wrapped.g.countries.textOne" : "wrapped.g.countries.text") : t("wrapped.g.countries.noneText"),
      flags: fresh.slice(0, 6).map((c) => c.code), aria: t("wrapped.g.countries.aria", { n: fresh.length }),
    },
    { id: "mvp", theme: "mint", kicker: t("wrapped.g.mvp.kicker"), big: gy.mvp ? n(gy.mvp.count) : "0", title: t("wrapped.g.mvp.title", { name: gy.mvp?.name ?? "—" }), text: t("wrapped.g.mvp.text"), aria: t("wrapped.g.mvp.aria", { name: gy.mvp?.name ?? "—", n: gy.mvp?.count ?? 0 }) },
    {
      id: "month", theme: "die", kicker: t("wrapped.g.month.kicker"), big: gy.bestMonth ? n(gy.bestMonth.count) : "0", title: t("wrapped.g.month.title", { month: gy.bestMonth ? monthName(gy.bestMonth.month) : "—" }),
      text: t("wrapped.g.month.text"), aria: t("wrapped.g.month.aria", { month: gy.bestMonth ? monthName(gy.bestMonth.month) : "—", n: gy.bestMonth?.count ?? 0 }),
    },
    {
      id: "cemetery", theme: "ink", kicker: t("wrapped.g.cemetery.kicker"), big: n(gy.fallen.length), title: t("wrapped.g.cemetery.title"),
      text: t(gy.fallen.length ? "wrapped.g.cemetery.text" : "wrapped.g.cemetery.textNone"), aria: t("wrapped.g.cemetery.aria", { n: gy.fallen.length }),
    },
    { id: "summary", theme: "brand", kicker: t("wrapped.g.summary.kicker"), big: n(gy.total), title: t("wrapped.g.summary.title", { c: gy.countries }), text: t("wrapped.g.summary.text", { name: gy.mvp?.name ?? "—" }), aria: t("wrapped.g.summary.aria") },
  ];
}
