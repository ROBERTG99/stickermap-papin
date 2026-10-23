import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { tiltByIndex } from "./map-parts";

export type StickerCardState = "default" | "processing" | "done" | "invalid";

interface StickerCardProps {
  /** 1-based step number shown on the tilted sticker (1 Foto · 2 Ubicación · 3 ¿Qué sticker?). */
  step: number;
  title: string;
  state?: StickerCardState;
  /** Status text for the non-done states ("Opcional", "…", "Falta"). Done always says "Lista". */
  status?: string;
  /** Inline error (invalid state), shown under the content with the alert icon. */
  error?: string;
  /** Lets the form scroll to the first invalid card. */
  id?: string;
  class?: string;
  children?: ComponentChildren;
}

/** A numbered step of the add form: one scrollable page of three cards, not a wizard. */
export function StickerCard({ step, title, state = "default", status, error, id, class: className, children }: StickerCardProps) {
  const titleId = useId();
  const done = state === "done";
  return (
    <section
      id={id}
      class={cx("mp-card mp-card--peel", done && "is-done", state === "invalid" && "is-invalid", className)}
      aria-labelledby={titleId}
      aria-busy={state === "processing" ? "true" : undefined}
    >
      <div class="mp-card__head">
        <span class="mp-card__num" style={`--tilt:${tiltByIndex(step - 1)}`}>
          {step}
        </span>
        <h2 class="mp-card__title" id={titleId}>
          {title}
        </h2>
        {done ? (
          <span class="mp-card__status">
            <Icon name="check" size="sm" />
            {t("components.card.done")}
          </span>
        ) : (
          status && <span class="mp-card__status mp-card__status--todo">{status}</span>
        )}
      </div>
      {children}
      {error && (
        <div class="mp-field__error" role="alert">
          <Icon name="alert" />
          {error}
        </div>
      )}
    </section>
  );
}
