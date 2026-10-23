import type { ComponentChildren } from "preact";
import { Icon } from "../components/Icon";
import { ProgressBar } from "../components/ProgressBar";
import { t } from "../lib/i18n";

export type AddSubmitState = "disabled" | "ready" | "uploading" | "failed";

interface AddSubmitBarProps {
  state: AddSubmitState;
  /** What is missing, when disabled ("tipo de sticker y ubicación"): the bar prints "Falta: …". */
  missing?: string;
  progress?: number;
  /** Friendly sentence for the failed state ("Se cortó la conexión. Tu sticker sigue acá."). */
  failure?: string;
  onSubmit: () => void;
  /** Extra line in the ready state, replaces the Turnstile note. */
  children?: ComponentChildren;
}

/**
 * Sticky bar of the add form. It is the design's SubmitBar with one difference: the disabled button is `aria-disabled`,
 * not `disabled`, so tapping it can still scroll to the first card that needs attention (design README, "Add form").
 */
export function AddSubmitBar({ state, missing, progress = 0, failure, onSubmit, children }: AddSubmitBarProps) {
  return (
    <div class="mp-submitbar">
      <div class="add__submit-wrap">
        {state === "disabled" && (
          <div class="mp-submitbar__row">
            <span class="mp-submitbar__hint" role="status">
              <Icon name="alert" />
              {missing ? t("add.submit.missing", { what: missing }) : t("add.submit.missingGeneric")}
            </span>
          </div>
        )}
        {state === "ready" && (
          <div class="mp-submitbar__row">
            <span class="mp-submitbar__hint" style={{ color: "var(--brand-ink)" }} role="status">
              <Icon name="check" />
              {t("add.submit.ready")}
            </span>
            {children ?? (
              <span class="mp-turnstile">
                <Icon name="shield" />
                {t("add.submit.verified")}
              </span>
            )}
          </div>
        )}
        {state === "uploading" && <ProgressBar value={progress} label={t("add.submit.uploading")} />}
        {state === "failed" && (
          <div class="mp-banner mp-banner--error" role="alert">
            <Icon name="wifi-off" />
            <span>{failure ?? t("error.network")}</span>
          </div>
        )}

        {state === "uploading" ? (
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block is-loading" disabled aria-busy="true">
            <span class="mp-spinner" aria-hidden="true" />
            {t("add.submit.sending")}
          </button>
        ) : state === "failed" ? (
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" onClick={onSubmit}>
            <Icon name="rotate" />
            {t("action.retry")}
          </button>
        ) : (
          <button
            type="button"
            class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block"
            aria-disabled={state === "disabled" ? "true" : undefined}
            onClick={onSubmit}
          >
            {t("action.submit")}
          </button>
        )}
      </div>
    </div>
  );
}
