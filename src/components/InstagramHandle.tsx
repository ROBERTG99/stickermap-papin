import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { profileUrl } from "../shared/instagram";
import { Icon } from "./Icon";

/** `@handle` that links out to instagram.com (F2). Never the Instagram logo: the at-sign icon plus the word is enough. */
export function InstagramLink({ handle, button, class: className }: { handle: string; button?: boolean; class?: string }) {
  return (
    <a class={cx("mp-ig", button && "mp-ig--btn", className)} href={profileUrl(handle)} target="_blank" rel="noopener noreferrer" aria-label={t("components.ig.open", { handle })}>
      <Icon name="at" />
      {handle}
    </a>
  );
}

/** "Tu Instagram": a bare input behind a fixed "@". */
export function InstagramField({ id, value, onInput, error, hint }: { id: string; value: string; onInput: (value: string) => void; error?: string; hint?: string }) {
  return (
    <div class={cx("mp-field", error && "is-invalid")}>
      <label class="mp-field__label" for={id}>
        {t("add.instagram.label")} <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>{t("add.instagram.optional")}</span>
      </label>
      <div class="mp-affix">
        <span class="mp-affix__pre" aria-hidden="true">@</span>
        <input
          id={id}
          value={value}
          autoComplete="off"
          autoCapitalize="none"
          spellcheck={false}
          inputMode="text"
          maxLength={40}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={`${id}-hint`}
          onInput={(e) => onInput(e.currentTarget.value)}
        />
      </div>
      <span class="mp-field__hint" id={`${id}-hint`}>{error ?? hint ?? t("add.instagram.hint")}</span>
    </div>
  );
}
