// How the kit's surfaces come and go (the rule is in globals.css, by
// `--ease-out`): in on the strong ease-out, out faster than in, and only a
// fade under reduced motion. Class strings, so every floating surface
// moves alike; each adds its own `origin-(--radix-…-transform-origin)` so
// it grows from its trigger.

const fade =
	"ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0";

const grow = "motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:zoom-out-95";

/** Menus, selects and their submenus: small, so quick (150ms in, 100ms out) */
export const menuMotion = `${fade} ${grow} data-[state=open]:duration-150 data-[state=closed]:duration-100`;

/** Popovers and dialogs: larger, a little slower (200ms in, 150ms out) */
export const panelMotion = `${fade} ${grow} data-[state=open]:duration-200 data-[state=closed]:duration-150`;

/** The dimmed backdrop under a dialog or sheet: a fade alone, as long as what it is under */
export const overlayMotion = `${fade} data-[state=open]:duration-200 data-[state=closed]:duration-150`;

/**
 * Press feedback for a control: it gives a little under the pointer
 * (100ms), not under reduced motion. Hover does not move a control on the
 * app's own surfaces; only controls over a picture grow (glass, solid)
 */
export const pressMotion =
	"transition-[color,background-color,box-shadow,opacity,scale] duration-150 ease-out active:duration-100 motion-safe:active:scale-[0.97]";

/** Whether the system asks for less motion: script-driven moves skip their
 * animation then, as CSS ones do with `motion-reduce` */
export const reducedMotion = () =>
	typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Script-driven moves' curves (Web Animations), as CSS takes them: a
 * strong ease-in, as a weight drops or a hand presses (`easeDrop`), and an
 * ease-in-out for a glide from one place to another (`easeGlide`) */
export const easeDrop = "cubic-bezier(0.55, 0, 1, 0.45)";
export const easeGlide = "cubic-bezier(0.65, 0, 0.35, 1)";
