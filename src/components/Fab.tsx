import type { MouseEventHandler } from "preact";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

export interface FabProps {
  /** Mobile goes to `/nuevo`: with `href` it renders a link, without it a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Icon-only round variant: only for very narrow viewports (<= 340px). Never shorten the label to "+". */
  round?: boolean;
  /** Visible label (extended) or accessible name (round). */
  label?: string;
  class?: string;
}

/** The always-visible "+ Agregar sticker" action (mobile only; desktop uses a primary button in the nav). */
export function Fab({ href, onClick, round, label, class: className }: FabProps) {
  const text = label ?? t("common.nav.add");
  const cls = cx("mp-fab", round && "mp-fab--round", className);
  const content = (
    <>
      <Icon name="plus" />
      {round ? null : text}
    </>
  );
  if (href) {
    return (
      <a class={cls} href={href} aria-label={round ? text : undefined} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" class={cls} aria-label={round ? text : undefined} onClick={onClick}>
      {content}
    </button>
  );
}
