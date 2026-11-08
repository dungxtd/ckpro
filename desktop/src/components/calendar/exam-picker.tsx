import { Input } from "@ckpro/ui/components/input";
import { menu, menuRow } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { cn } from "@ckpro/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";
import { useExam } from "@/stores/exam";
import { shortTitle } from "@/titles";

/**
 * Pick an exam to plan on a day: the exams by certification under a field
 * that narrows them; Enter plans the first, a click the one clicked. The
 * trigger (`children`) is the + that asked
 */
export function ExamPicker({
	label,
	onPick,
	onOpenChange,
	children,
}: {
	label: string;
	/** Told when it opens or closes */
	onOpenChange?: (open: boolean) => void;
	onPick: (examId: string) => void;
	children: ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const field = useRef<HTMLInputElement>(null);
	const box = useRef<HTMLDivElement>(null);
	const q = query.trim().toLowerCase();
	const matches = catalog.filter(e => e.title.toLowerCase().includes(q));
	const certs = [...new Set(matches.map(e => e.certification))];
	const pick = (id: string) => {
		onPick(id);
		setOpen(false);
		setQuery("");
	};
	return (
		<Popover
			open={open}
			onOpenChange={o => {
				setOpen(o);
				onOpenChange?.(o);
				if (!o) setQuery("");
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				ref={box}
				className="flex w-72 flex-col p-2"
				// Opened to be typed in: the field has the focus. It keeps the
				// height it opened with: shorter as it narrows, it would move to
				// the other side of the day
				onOpenAutoFocus={e => {
					e.preventDefault();
					field.current?.focus();
					if (box.current) box.current.style.minHeight = `${box.current.offsetHeight}px`;
				}}
			>
				<Input
					ref={field}
					type="search"
					aria-label={label}
					placeholder={label}
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter" && matches[0]) pick(matches[0].id);
					}}
					className="h-8"
				/>
				{certs.map(cert => (
					<div key={cert}>
						<div className={menu.header}>{cert.toUpperCase()}</div>
						{matches
							.filter(e => e.certification === cert)
							.map(e => (
								<button
									key={e.id}
									type="button"
									onClick={() => pick(e.id)}
									// What Enter would plan is marked while typing
									className={menuRow(cn("pl-2.5", e === matches[0] && q && "bg-highlight/20"))}
								>
									<span className={menu.label}>{shortTitle(e.title)}</span>
								</button>
							))}
					</div>
				))}
				{!matches.length && (
					<p className="px-2 py-2 text-caption text-muted-foreground">No exam has that.</p>
				)}
				{/* At the foot, however few exams match */}
				<div className="mt-auto pt-1">
					<p className="border-border border-t px-2 pt-1.5 text-2xs text-muted-foreground">
						Planned as practice; its tag changes that
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
