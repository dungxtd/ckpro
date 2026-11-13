/**
 * Whether the app runs on macOS (else Windows or Linux): for what differs
 * between them only, as the command key, how shortcuts are written and the
 * window's own buttons. Everything else is drawn and behaves the same
 */
export const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** Whether the app runs on Linux: its window buttons are GNOME's, not Windows' */
export const linux = !mac && typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent);

/** The command key held: ⌘ on macOS, Ctrl on Windows */
export const command = (e: { metaKey: boolean; ctrlKey: boolean }) => (mac ? e.metaKey : e.ctrlKey);
