import { cx } from "../lib/cx";

export interface EmptyStateAction {
  label: string;
  /** Renders a link (primary button) when set; otherwise a secondary button. */
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  /** Type icon on the die-cut sticker, e.g. "/img/icons/papa.png". */
  icon: string;
  title: string;
  body?: string;
  /** One way out. */
  action?: EmptyStateAction;
  /** Wrap in a card (over the map or inside a page). */
  card?: boolean;
  class?: string;
}

/** "Nothing here" with a joke and a way out. */
export function EmptyState({ icon, title, body, action, card, class: className }: EmptyStateProps) {
  const content = (
    <div class={cx("mp-empty", !card && className)}>
      <div class="mp-peeled">
        <img src={icon} alt="" />
      </div>
      <h2 class="mp-empty__title">{title}</h2>
      {body && <p class="mp-empty__body">{body}</p>}
      {action &&
        (action.href ? (
          <a class="mp-btn mp-btn--primary" href={action.href} onClick={action.onClick}>
            {action.label}
          </a>
        ) : (
          <button type="button" class="mp-btn mp-btn--secondary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
  return card ? <div class={cx("mp-card", className)}>{content}</div> : content;
}
