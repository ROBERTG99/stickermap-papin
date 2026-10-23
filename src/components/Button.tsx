import type { ComponentChildren, JSX } from "preact";
import { cx } from "../lib/cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

type NativeButtonProps = Omit<JSX.IntrinsicElements["button"], "size" | "children" | "class" | "className" | "type">;

export interface ButtonProps extends NativeButtonProps {
  /** One primary per view. `danger` only inside a confirm sheet; its trigger is `danger-ghost`. */
  variant?: ButtonVariant;
  /** `sm` = 40px (keep a 44px hit area around it), `md` = default, `lg` = 56px (submit bar, Gracias). */
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Leading icon (decorative: the label names the action). */
  icon?: IconName;
  /** Shows the spinner; pass a label that says what is happening ("Subiendo…"). Clicks are ignored. */
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  class?: string;
  children?: ComponentChildren;
}

/** Text button. Labels are verbs in voseo and sentence case: "Agregar otro". */
export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  loading,
  type = "button",
  class: className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={cx(
        "mp-btn",
        `mp-btn--${variant}`,
        size !== "md" && `mp-btn--${size}`,
        block && "mp-btn--block",
        loading && "is-loading",
        className,
      )}
      aria-busy={loading ? "true" : undefined}
      onClick={loading ? undefined : onClick}
    >
      {loading ? <span class="mp-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? "sm" : undefined} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends NativeButtonProps {
  icon: IconName;
  /** Required accessible name ("Cerrar"). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  class?: string;
}

/** Round icon-only button (`mp-btn--icon`); always carries an `aria-label`. */
export function IconButton({ icon, label, variant = "secondary", size = "md", type = "button", class: className, ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={cx("mp-btn", `mp-btn--${variant}`, "mp-btn--icon", size !== "md" && `mp-btn--${size}`, className)}
      aria-label={label}
    >
      <Icon name={icon} size={size === "sm" ? "sm" : undefined} />
    </button>
  );
}
