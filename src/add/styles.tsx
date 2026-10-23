/**
 * Layout-only CSS for the add, thank-you and edit pages. The design system has no page-level classes for these screens
 * (the previews position everything with inline styles), so they live here, written only with design tokens.
 */
const CSS = `
.add { display: flex; flex-direction: column; height: 100dvh; background: var(--bg); color: var(--ink); }
.add__scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scroll-padding-top: var(--space-4); }
.add__cards { display: grid; gap: var(--space-6); padding: var(--space-4) var(--space-4) var(--space-8); max-width: 640px; margin: 0 auto; }
.add__notice { display: grid; gap: var(--space-3); }
.add > .mp-submitbar, .add__form > .mp-submitbar { flex: none; padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
.add__submit-wrap { max-width: 640px; width: 100%; margin: 0 auto; display: grid; gap: 8px; }
.add [inert] { opacity: .55; }

.add--desktop .add__body { flex: 1; min-height: 0; display: grid; grid-template-columns: 560px minmax(0, 1fr); }
.add__form { display: flex; flex-direction: column; min-height: 0; background: var(--bg); box-shadow: 1px 0 0 var(--line); }
.add__form-head { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-6) 28px 0; }
.add__form-head h1 { margin: 0; font: var(--fw-title) var(--fs-title)/var(--lh-title) var(--font-display); color: var(--ink-strong); }
.add__form-head .mp-badge { margin-left: auto; }
.add--desktop .add__cards { max-width: none; padding: var(--space-4) 28px 28px; }
.add--desktop .add__submit-wrap { max-width: none; }
.add--desktop .add__form > .mp-submitbar { padding-left: 28px; padding-right: 28px; }
.add__map { position: relative; min-width: 0; min-height: 0; background: var(--map-land); }
.add__map .add-map { position: absolute; inset: 0; }

/* Nested components that draw their own card: flatten them inside a numbered card. */
.add-flat > .mp-card { padding: 0; background: transparent; box-shadow: none; border-radius: 0; }
.add--desktop .add-loc > .mp-card > .mp-photo[role="group"] { display: none; }
.add-loc .mp-photo[role="group"] { aspect-ratio: auto; height: 170px; transition: height 220ms cubic-bezier(.2,.9,.3,1.1); box-shadow: inset 0 0 0 1px var(--line); }
.add-loc--big .mp-photo[role="group"] { height: 340px; }

.add-map { position: relative; width: 100%; height: 100%; min-height: 0; }
.add-map__canvas { position: absolute; inset: 0; }
.add-map__canvas .maplibregl-canvas { outline: 0; }
.add-map__attrib { position: absolute; left: var(--space-2); bottom: var(--space-2); z-index: var(--z-overlay); font-size: var(--fs-micro); }
.add-map__attrib a { color: inherit; text-decoration: none; }
.add--desktop .add-map__attrib { left: auto; right: var(--space-2); }
.add-map__expand { position: absolute; right: var(--space-2); bottom: var(--space-2); width: 40px; min-height: 40px; padding: 0; z-index: var(--z-overlay); }
.add-map__note { position: absolute; left: var(--space-2); top: var(--space-2); z-index: var(--z-overlay); }
.add-map__controls { position: absolute; top: var(--space-6); right: var(--space-6); }
.add-map__coords { position: absolute; left: var(--space-6); bottom: var(--space-6); height: 34px; padding: 0 14px; gap: 8px; background: var(--surface); box-shadow: var(--shadow-lift); font-size: 13px; z-index: var(--z-overlay); }
.add-pin { cursor: grab; }
.add-pin:active { cursor: grabbing; }

.add-photo { display: grid; grid-template-columns: 104px 1fr; gap: var(--space-3); align-items: center; }
.add-photo__thumb { border-radius: var(--radius-md); overflow: hidden; }
.add-photo__thumb .mp-photo { --ratio: 1; border-radius: var(--radius-md); transform: rotate(var(--tilt-1)); box-shadow: var(--die-outline), var(--shadow-sticker); }
.add-photo__thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.add-photo__tools { display: grid; gap: var(--space-1); justify-items: start; }
.add-photo__pick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.add-photo__pick .mp-typetile { padding: 18px 8px; }
.add-photo__status { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-3); }
.add-photo__extra { display: grid; gap: var(--space-3); margin-top: var(--space-3); }
.add-what { display: grid; gap: var(--space-4); margin-top: var(--space-5); }
.add-what > .add-flat > .mp-card { gap: var(--space-3); }
.add-note { justify-self: start; padding: 0 var(--space-2); }

.add-conflict-pin { display: grid; place-items: center; height: 100%; gap: 4px; padding-top: 8px; }
.add-conflict-pin .mp-pin__head { width: 28px; height: 28px; }
.add-conflict-pin .mp-pin__head::after { width: 9px; height: 9px; }

.add-dup__art { display: flex; align-items: center; gap: var(--space-3); }
.add-dup__thumb { width: 64px; flex: none; border-radius: 10px; overflow: hidden; }
.add-dup__thumb img { display: block; width: 100%; height: 64px; object-fit: cover; }
.add-dup__form { display: grid; gap: var(--space-4); max-height: 60dvh; overflow-y: auto; padding: 4px; margin: -4px; }

/* Thanks */
.thanks { min-height: 100dvh; background: var(--bg); display: flex; flex-direction: column; }
.thanks__hero { position: relative; display: grid; place-items: center; background: var(--mint); min-height: clamp(224px, 32dvh, 300px); overflow: hidden; }
.thanks__rays { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.thanks__rays i { position: absolute; left: -3px; top: 0; width: 6px; height: 22px; border-radius: 3px; background: var(--brand); transform-origin: 3px 0; opacity: 0; animation: thanks-ray 420ms 180ms ease-out forwards; }
@keyframes thanks-ray { from { opacity: 0; } to { opacity: .9; } }
.thanks__sticker-wrap { display: inline-grid; }
.thanks__sticker-wrap > .thanks__sticker { animation-delay: inherit; }
.thanks__sticker { --s: 180px; position: relative; z-index: 1; animation: mp-slap 420ms cubic-bezier(.2,.9,.3,1.1) both; }
.thanks__body { display: grid; gap: var(--space-3); justify-items: center; width: 100%; max-width: 480px; margin: 0 auto; padding: var(--space-6) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom)); text-align: center; }
.thanks__title { margin: 0; font: var(--fw-display) var(--fs-display)/var(--lh-display) var(--font-display); letter-spacing: var(--ls-display); color: var(--ink-strong); }
.thanks__line { margin: 0; font-size: 17px; line-height: 24px; color: var(--ink); }
.thanks__polaroid { width: min(188px, 52%); margin: var(--space-2) 0 var(--space-3); }
.thanks__actions { display: grid; gap: var(--space-2); width: 100%; margin-top: var(--space-2); }
.thanks__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.thanks__body .mp-banner { width: 100%; text-align: left; }
@media (prefers-reduced-motion: reduce) {
  .thanks__sticker { animation: thanks-fade 200ms ease-out both; }
  .thanks__rays i { animation: thanks-fade 200ms ease-out forwards; }
}
@keyframes thanks-fade { from { opacity: 0; } to { opacity: 1; } }

/* Edit */
.edit__banner { padding: var(--space-3) var(--space-4) 0; max-width: 640px; margin: 0 auto; width: 100%; }
.edit__bar { display: grid; gap: var(--space-2); }
.edit__bar .mp-btn--danger-ghost { justify-self: center; }
.edit-loc { position: relative; height: 200px; border-radius: var(--radius-md); overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); }
.edit__state { display: grid; place-items: center; min-height: 60dvh; padding: var(--space-6) var(--space-4); }
`;

export function AddStyles() {
  return <style>{CSS}</style>;
}
