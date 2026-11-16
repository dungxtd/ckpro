import { cn } from "@ckpro/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/** The digits written dd/mm/yyyy, the slashes put in as they come */
export const shown = (digits: string) =>
	[digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");

/** YYYY-MM-DD of eight digits ddmmyyyy, when they make a real day */
/** Where the caret goes after `n` digits, in the field as shown */
const caretAt = (n: number) => n + (n > 2 ? 1 : 0) + (n > 4 ? 1 : 0);
/** How many digits come before position `at` of what is written */
const digitsBefore = (text: string, at: number) => text.slice(0, at).replace(/\D/g, "").length;

export function dayOf(digits: string): string | null {
	if (digits.length !== 8) return null;
	const [d, m, y] = [
		Number(digits.slice(0, 2)),
		Number(digits.slice(2, 4)),
		Number(digits.slice(4)),
	];
	const date = new Date(y, m - 1, d);
	if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
	return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/**
 * A day typed in numbers in one field, dd/mm/yyyy, the slashes put in as
 * it is typed (20032027 reads 20/03/2027; a whole date pasted works). No
 * calendar to pick from. `onChange` gets YYYY-MM-DD once it is a real day
 * (null while it is not); `onCommit` once the field is left or Enter is
 * pressed. `invalid` marks it (a day passed). A new `value` given replaces
 * what is typed; editing mid-field keeps the caret where it was
 */
export function DateField({
	value,
	onChange,
	onCommit,
	label,
	invalid,
	className,
}: {
	/** YYYY-MM-DD, or empty */
	value: string;
	onChange: (day: string | null) => void;
	onCommit?: () => void;
	label: string;
	invalid?: boolean;
	className?: string;
}) {
	const toDigits = (day: string) => {
		const [y, m, d] = day ? day.split("-") : [];
		return day ? `${d}${m}${y}` : "";
	};
	const [digits, setDigits] = useState(() => toDigits(value));
	// A new day given from outside replaces what is typed
	const [given, setGiven] = useState(value);
	if (value !== given) {
		setGiven(value);
		setDigits(toDigits(value));
	}
	const field = useRef<HTMLInputElement>(null);
	// The caret kept after the same digit as the slashes come and go
	const caret = useRef<number | null>(null);
	useLayoutEffect(() => {
		if (caret.current === null || !field.current) return;
		const at = caretAt(caret.current);
		field.current.setSelectionRange(at, at);
		caret.current = null;
	});
	const take = (next: string, digitCaret: number) => {
		caret.current = Math.min(digitCaret, next.length);
		setDigits(next);
		onChange(dayOf(next));
	};
	const bad = invalid || (digits.length === 8 && dayOf(digits) === null);
	return (
		<input
			aria-label={label}
			aria-invalid={bad || undefined}
			inputMode="numeric"
			autoComplete="off"
			placeholder="dd/mm/yyyy"
			ref={field}
			value={shown(digits)}
			onChange={e => {
				const el = e.target;
				const at = digitsBefore(el.value, el.selectionStart ?? el.value.length);
				take(el.value.replace(/\D/g, "").slice(0, 8), at);
			}}
			onBlur={() => onCommit?.()}
			onKeyDown={e => {
				if (e.key === "Enter") onCommit?.();
				// Backspace just after a slash takes the digit before it
				const el = e.currentTarget;
				const at = el.selectionStart ?? 0;
				if (e.key === "Backspace" && at === el.selectionEnd && el.value[at - 1] === "/") {
					e.preventDefault();
					const n = digitsBefore(el.value, at);
					take(digits.slice(0, n - 1) + digits.slice(n), n - 1);
				}
			}}
			className={cn(
				"glass-surface h-9 w-32 min-w-0 rounded-lg px-3 font-mono text-sm tabular-nums outline-none transition-[box-shadow] duration-150 ease-out placeholder:text-muted-foreground",
				"focus-visible:ring-[3px] focus-visible:ring-ring/50",
				bad && "ring-1 ring-destructive",
				className
			)}
		/>
	);
}
