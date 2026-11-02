import { Popover, PopoverContent, PopoverTrigger } from "@cktry/ui/components/popover";
import { cn } from "@cktry/ui/lib/utils";
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
	children,
}: {
	label: string;
	onPick: (examId: string) => void;
	children: ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const field = useRef<HTMLInputElement>(null);
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
				if (!o) setQuery("");
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				className="w-72 p-2"
				// Opened to be typed in: the field has the focus
				onOpenAutoFocus={e => {
					e.preventDefault();
					field.current?.focus();
				}}
			>
				<input
					ref={field}
					aria-label={label}
					placeholder={label}
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter" && matches[0]) pick(matches[0].id);
					}}
					className="w-full rounded-md bg-foreground/10 px-2.5 py-1.5 text-callout outline-none placeholder:text-muted-foreground"
				/>
				{certs.map(cert => (
					<div key={cert}>
						<div className="px-2 pt-2 pb-0.5 font-semibold text-2xs text-muted-foreground">
							{cert.toUpperCase()}
						</div>
						{matches
							.filter(e => e.certification === cert)
							.map(e => (
								<button
									key={e.id}
									type="button"
									onClick={() => pick(e.id)}
									className={cn(
										"block w-full truncate rounded-md px-2 py-1 text-left text-callout outline-none hover:bg-highlight hover:text-highlight-foreground focus-visible:bg-highlight focus-visible:text-highlight-foreground",
										e === matches[0] && q && "bg-highlight/20"
									)}
								>
									{shortTitle(e.title)}
								</button>
							))}
					</div>
				))}
				{!matches.length && (
					<p className="px-2 py-2 text-caption text-muted-foreground">No exam has that.</p>
				)}
				<p className="mt-1 border-border border-t px-2 pt-1.5 text-2xs text-muted-foreground">
					Planned as practice; its tag changes that
				</p>
			</PopoverContent>
		</Popover>
	);
}
