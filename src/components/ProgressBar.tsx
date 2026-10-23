import type { ComponentChildren } from "preact";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";

interface ProgressBarProps {
  /** 0–100. */
  value: number;
  /** Visible label, e.g. "Subiendo foto…". The percentage is appended on the right. */
  label: string;
  class?: string;
}

/** Upload progress: label + percentage row and an accessible progressbar. */
export function ProgressBar({ value, label, class: className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div class={className}>
      <div class="mp-progress__label">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div class="mp-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label.replace(/…$/, "")}>
        <div class="mp-progress__bar" style={{ "--value": `${pct}%` }} />
      </div>
    </div>
  );
}

export type SubmitBarState = "disabled" | "ready" | "uploading" | "failed";

interface SubmitBarProps {
  state: SubmitBarState;
  /** What is missing, when disabled: "elegir el tipo y la ubicación" renders "Falta: elegir el tipo y la ubicación". */
  missing?: string;
  /** 0–100, while uploading. */
  progress?: number;
  onSubmit?: () => void;
  onRetry?: () => void;
  /** Extra content for the ready row, replaces the Turnstile line. */
  children?: ComponentChildren;
  class?: string;
}

/** Sticky submit bar of the add form: disabled with a hint · ready · uploading · failed. */
export function SubmitBar({ state, missing, progress = 0, onSubmit, onRetry, children, class: className }: SubmitBarProps) {
  return (
    <div class={cx("mp-submitbar", className)}>
      {state === "disabled" && (
        <>
          <div class="mp-submitbar__row">
            <span class="mp-submitbar__hint">
              <Icon name="alert" />
              {missing ? `Falta: ${missing}` : "Falta completar el formulario"}
            </span>
          </div>
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" disabled>
            Mandale Mecha
          </button>
        </>
      )}
      {state === "ready" && (
        <>
          <div class="mp-submitbar__row">
            <span class="mp-submitbar__hint" style={{ color: "var(--brand-ink)" }}>
              <Icon name="check" />
              Todo listo
            </span>
            {children ?? (
              <span class="mp-turnstile">
                <Icon name="shield" />
                Verificado por Cloudflare
              </span>
            )}
          </div>
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" onClick={onSubmit}>
            Mandale Mecha
          </button>
        </>
      )}
      {state === "uploading" && (
        <>
          <ProgressBar value={progress} label="Subiendo foto…" />
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block is-loading" disabled aria-busy="true">
            <span class="mp-spinner" aria-hidden="true" />
            Mandando…
          </button>
        </>
      )}
      {state === "failed" && (
        <>
          <div class="mp-banner mp-banner--error" role="alert">
            <Icon name="wifi-off" />
            Se cortó la conexión. Tu sticker sigue acá.
          </div>
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" onClick={onRetry}>
            <Icon name="rotate" />
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}
