import { IconButton } from "@ckpro/ui/components/icon-button";
import { Input } from "@ckpro/ui/components/input";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

/** The ranges of `query` in the text under `root`, in reading order */
export function findRanges(root: Node, query: string): Range[] {
	const q = query.toLowerCase();
	if (!q) return [];
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent?.toLowerCase() ?? "";
		for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) {
			const range = document.createRange();
			range.setStart(node, at);
			range.setEnd(node, at + q.length);
			ranges.push(range);
		}
	}
	return ranges;
}

/** Paint the matches (`find`) and the one shown (`find-current`): the
 * browser draws them over the text, nothing of the page changes */
function paint(ranges: Range[], current: number) {
	if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
	CSS.highlights.set("find", new Highlight(...ranges));
	CSS.highlights.set("find-current", new Highlight(...(ranges[current] ? [ranges[current]] : [])));
}

function clear() {
	if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
	CSS.highlights.delete("find");
	CSS.highlights.delete("find-current");
}

/**
 * Find in a session, as Cmd+F (Ctrl+F) does in a page: opened with the
 * shortcut while the focus or the pointer is in `area`; Enter goes to the
 * next match, Shift+Enter to the one before, Escape closes. `messages` is
 * what is searched; it may grow while open (an answer being written)
 */
export function FindInSession({
	area,
	messages,
	version,
}: {
	area: RefObject<HTMLElement | null>;
	messages: RefObject<HTMLElement | null>;
	/** Changes when the messages do: the matches are found again */
	version: unknown;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [current, setCurrent] = useState(0);
	const [count, setCount] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	const pointerIn = useRef(false);

	useEffect(() => {
		const el = area.current;
		if (!el) return;
		const enter = () => {
			pointerIn.current = true;
		};
		const leave = () => {
			pointerIn.current = false;
		};
		const keys = (e: KeyboardEvent) => {
			const inside = el.contains(document.activeElement) || pointerIn.current;
			if (inside && (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
				e.preventDefault();
				setOpen(true);
				requestAnimationFrame(() => field.current?.select());
			}
		};
		el.addEventListener("pointerenter", enter);
		el.addEventListener("pointerleave", leave);
		window.addEventListener("keydown", keys);
		return () => {
			el.removeEventListener("pointerenter", enter);
			el.removeEventListener("pointerleave", leave);
			window.removeEventListener("keydown", keys);
		};
	}, [area]);

	// The matches, found again as the query or the messages change
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the cue that the messages changed
	useEffect(() => {
		const root = messages.current;
		if (!open || !root) {
			clear();
			setCount(0);
			return;
		}
		const ranges = findRanges(root, query.trim());
		const at = Math.min(current, Math.max(0, ranges.length - 1));
		setCount(ranges.length);
		paint(ranges, at);
		ranges[at]?.startContainer.parentElement?.scrollIntoView({ block: "center" });
		return clear;
	}, [open, query, current, version, messages]);

	if (!open) return null;
	const step = (by: number) => count > 0 && setCurrent(c => (c + by + count) % count);
	return (
		<div className="flex items-center gap-1 border-border border-b px-2 py-1.5">
			<Input
				ref={field}
				type="search"
				aria-label="Find in this session"
				placeholder="Find in this session"
				className="h-7 min-w-0 flex-1"
				value={query}
				onChange={e => {
					setQuery(e.target.value);
					setCurrent(0);
				}}
				onKeyDown={e => {
					if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
					if (e.key === "Escape") {
						e.preventDefault();
						setOpen(false);
					}
				}}
			/>
			<span className="w-14 shrink-0 text-right text-muted-foreground text-caption tabular-nums">
				{query.trim() ? `${count ? current + 1 : 0} of ${count}` : ""}
			</span>
			<IconButton variant="toolbar" size="xs" aria-label="Previous match" onClick={() => step(-1)}>
				<ChevronUp />
			</IconButton>
			<IconButton variant="toolbar" size="xs" aria-label="Next match" onClick={() => step(1)}>
				<ChevronDown />
			</IconButton>
			<IconButton
				variant="toolbar"
				size="xs"
				aria-label="Close find"
				onClick={() => setOpen(false)}
			>
				<X />
			</IconButton>
		</div>
	);
}
