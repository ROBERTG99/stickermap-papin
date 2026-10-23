import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/ProgressBar";
import { t } from "../../lib/i18n";
import { cx } from "../../lib/cx";
import type { BulkProblem } from "./effective";
import { plural } from "./ui";

interface ReviewBarProps {
  count: number;
  unplaced: number;
  problem: BulkProblem | null;
  onSubmit: () => void;
  /** Tapping the "Falta: …" hint jumps to the card that needs attention. */
  onShowProblem: () => void;
}

/** Sticky bar of the review: "Mandale Mecha (46)" and what is left behind. Same markup as the design's submit bar. */
export function ReviewBar({ count, unplaced, problem, onSubmit, onShowProblem }: ReviewBarProps) {
  return (
    <div class="mp-submitbar bulk__submit">
      <div class="bulk__submit-bar">
        <div class="mp-submitbar__row">
          {problem ? (
            <button type="button" class="mp-submitbar__hint" role="button" onClick={problem === "none" ? undefined : onShowProblem}>
              <Icon name="alert" />
              {t(`bulk.missing.${problem}`)}
            </button>
          ) : unplaced > 0 ? (
            <span class="bulk__submit-note"><Icon name="info" />{plural(unplaced, "bulk.submit.unplacedOne", "bulk.submit.unplaced")}</span>
          ) : (
            <span class="bulk__submit-note"><Icon name="check" />{t("bulk.submit.ready")}</span>
          )}
          <span class="mp-turnstile"><Icon name="shield" />{t("bulk.submit.turnstile")}</span>
        </div>
        {problem && unplaced > 0 && problem !== "none" && (
          <span class="bulk__submit-note bulk__submit-note--warn"><Icon name="info" />{plural(unplaced, "bulk.submit.unplacedOne", "bulk.submit.unplaced")}</span>
        )}
        <button type="button" class={cx("mp-btn mp-btn--primary mp-btn--lg mp-btn--block")} disabled={problem !== null} onClick={onSubmit}>
          {t("bulk.send")} ({count})
        </button>
      </div>
    </div>
  );
}

interface UploadBarProps {
  done: number;
  total: number;
  failed: number;
  running: boolean;
  onRetry: () => void;
}

/** Bar of the upload: overall progress while it runs, "Reintentar fallidas" when some did not make it. */
export function UploadBar({ done, total, failed, running, onRetry }: UploadBarProps) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <div class="mp-submitbar bulk__submit">
      <div class="bulk__submit-bar">
        <ProgressBar value={pct} label={t("bulk.upload.progress", { done, total })} />
        {running ? (
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block is-loading" disabled aria-busy="true">
            <span class="mp-spinner" aria-hidden="true" />
            {t("bulk.upload.sending")}
          </button>
        ) : failed > 0 ? (
          <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" onClick={onRetry}>
            <Icon name="rotate" />
            {t("bulk.upload.retry", { n: failed })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
