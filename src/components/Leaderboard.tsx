import { useState } from "preact/hooks";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Avatar } from "./Avatar";
import { formatInt } from "./StatSticker";

export interface LeaderboardRow {
  name: string;
  count: number;
  /** The viewer's own row: highlighted, "(vos)". */
  isYou?: boolean;
}

interface LeaderboardProps {
  /** Rows sorted by count, descending. */
  rows: readonly LeaderboardRow[];
  /** Rows shown before "Ver los N" (default 5). */
  limit?: number;
  /** Profile URL for a name (default `/p/<name>`). */
  hrefFor?: (name: string) => string;
  /** Spoken unit after each count, e.g. "stickers" (visually hidden). */
  unit?: string;
  /** Note under the list, e.g. "49 stickers sin dueño todavía". */
  footnote?: string;
  class?: string;
}

/** Ties share the rank: 46, 21, 5, 5, 3 → 1, 2, 3, 3, 5. */
function rankOf(rows: readonly LeaderboardRow[], i: number): number {
  let first = i;
  while (first > 0 && rows[first - 1]?.count === rows[i]?.count) first--;
  return first + 1;
}

/** "Más pegados" / "Más cargados" ranking: medals for 1–3, avatar, name, count. Rows link to the profile. */
export function Leaderboard({ rows, limit = 5, hrefFor = (name) => `/p/${encodeURIComponent(name)}`, unit, footnote, class: className }: LeaderboardProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, limit);
  const hidden = rows.length - visible.length;
  return (
    <div class={className} style={{ display: "grid", gap: "var(--space-3)" }}>
      <ol class="mp-board">
        {visible.map((row, i) => {
          const rank = rankOf(rows, i);
          return (
            <li key={row.name}>
              <a class={cx("mp-board__row", row.isYou && "is-you")} href={hrefFor(row.name)}>
                <span class={cx("mp-medal", rank <= 3 ? `mp-medal--${rank}` : "mp-medal--n")}>{rank}</span>
                <Avatar name={row.name} />
                <span class="mp-board__name">
                  {row.name}
                  {row.isYou && (
                    <>
                      {" "}
                      <small>{t("components.person.you")}</small>
                    </>
                  )}
                </span>
                <span class="mp-board__count">
                  {formatInt(row.count)}
                  {unit && <span class="mp-sr"> {unit}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <button type="button" class="mp-btn mp-btn--ghost" style={{ justifySelf: "start" }} onClick={() => setExpanded(true)}>
          Ver los {formatInt(rows.length)}
        </button>
      )}
      {footnote && <p class="mp-keys">{footnote}</p>}
    </div>
  );
}
