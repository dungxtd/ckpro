import { useSyncExternalStore } from "react";

const subscribe = (changed: () => void) => {
	document.addEventListener("visibilitychange", changed);
	return () => document.removeEventListener("visibilitychange", changed);
};

/**
 * Whether the window is seen now: not minimised, hidden or covered (the
 * system pauses or slows what runs in a window not seen). What plays a
 * moment once waits for it, so it is not played to no one or out of step
 */
export const usePageVisible = () =>
	useSyncExternalStore(
		subscribe,
		() => document.visibilityState === "visible",
		() => true
	);
