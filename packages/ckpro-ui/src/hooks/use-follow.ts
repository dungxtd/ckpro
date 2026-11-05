import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Keep a scrolling element at its newest content (a log, a conversation)
 * as `content` grows, unless the reader scrolled up from the end: it
 * follows again once they are back. It opens at the end. `slack`: how near
 * the end counts as there. Put the returned ref on the scrolling element
 */
export function useFollow<T extends HTMLElement>(content: unknown, slack = 24) {
	const box = useRef<T | null>(null);
	const following = useRef(true);
	const onScroll = useCallback(
		(e: Event) => {
			const el = e.currentTarget as T;
			following.current = el.scrollHeight - el.scrollTop - el.clientHeight < slack;
		},
		[slack]
	);
	const ref = useCallback(
		(el: T | null) => {
			box.current?.removeEventListener("scroll", onScroll);
			box.current = el;
			if (!el) return;
			el.addEventListener("scroll", onScroll, { passive: true });
			following.current = true;
			el.scrollTop = el.scrollHeight;
		},
		[onScroll]
	);
	// Every change of the content: at the end if the reader is there
	// biome-ignore lint/correctness/useExhaustiveDependencies: the content changing is the cue
	useLayoutEffect(() => {
		const el = box.current;
		if (el && following.current) el.scrollTop = el.scrollHeight;
	}, [content]);
	return ref;
}
