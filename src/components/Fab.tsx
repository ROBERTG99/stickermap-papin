import type { MouseEventHandler } from "preact";
import { cx } from "../lib/cx";
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
export function Fab({ href, onClick, round, label = "Agregar sticker", class: className }: FabProps) {
  const cls = cx("mp-fab", round && "mp-fab--round", className);
  const content = (
    <>
      <Icon name="plus" />
      {round ? null : label}
    </>
  );
  if (href) {
    return (
      <a class={cls} href={href} aria-label={round ? label : undefined} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" class={cls} aria-label={round ? label : undefined} onClick={onClick}>
      {content}
    </button>
  );
}
