import { useRef } from "preact/hooks";
import { cx } from "../lib/cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Id of the visible label element (preferred). */
  labelledBy?: string;
  /** Fallback accessible name when there is no visible label element. */
  ariaLabel?: string;
  class?: string;
}

/**
 * One choice among 2-3 short options (`radiogroup`). Arrow keys move the selection;
 * only the selected option is in the tab order (roving tabindex).
 */
export function Segmented<T extends string>({ options, value, onChange, labelledBy, ariaLabel, class: className }: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function move(from: number, step: 1 | -1) {
    for (let i = 1; i <= options.length; i++) {
      const idx = (from + step * i + options.length * i) % options.length;
      const opt = options[idx];
      if (opt && !opt.disabled) return idx;
    }
    return from;
  }

  function onKeyDown(e: KeyboardEvent) {
    let target = -1;
    const from = selectedIndex >= 0 ? selectedIndex : 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = move(from, 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = move(from, -1);
    else if (e.key === "Home") target = move(-1, 1);
    else if (e.key === "End") target = move(options.length, -1);
    const next = options[target];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[target]?.focus();
  }

  return (
    <div
      ref={groupRef}
      class={cx("mp-seg", className)}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          class="mp-seg__opt"
          role="radio"
          aria-checked={i === selectedIndex}
          tabIndex={i === tabbableIndex ? 0 : -1}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
