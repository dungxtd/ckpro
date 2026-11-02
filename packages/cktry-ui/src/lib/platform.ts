/**
 * Whether the app runs on macOS (else Windows): for what differs between
 * them only, as the command key and how shortcuts are written. Everything
 * else is drawn and behaves the same on both
 */
export const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** The command key held: ⌘ on macOS, Ctrl on Windows */
export const command = (e: { metaKey: boolean; ctrlKey: boolean }) => (mac ? e.metaKey : e.ctrlKey);
