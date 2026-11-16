import { Card } from "@ckpro/ui/components/card";
import { SidebarItem } from "@ckpro/ui/components/sidebar";
import { Swatch } from "@ckpro/ui/components/swatch";
import { UsageBar, UsageMarkKey } from "@ckpro/ui/components/usage-bar";
import { cn } from "@ckpro/ui/lib/utils";
import type { ReactNode } from "react";
import { memory } from "@/words";
import type { Part } from "./usage";

/** Each kind of part's colour (`part-*` tokens): ckpro's own in colours,
 * what is not its own in grey, as macOS Storage colours its categories */
const COLOUR: Record<Part["kind"], string> = {
	exam: "bg-part-exam",
	proof: "bg-part-proof",
	other: "bg-part-exam",
	services: "bg-part-services",
	others: "bg-part-others",
	machine: "bg-part-machine",
};

/** What each part is, beside its name */
const WHAT: Record<Part["kind"], string> = {
	exam: "Your exam's cluster",
	proof: "Proving an exam",
	other: "Not in use now",
	services: "Task host, desktop, image cache",
	others: "Not started by CKPro",
	machine: "Running outside Docker",
};

/**
 * Docker's memory as a storage bar (the kit's `UsageBar`): a stretch in a
 * colour per part, the free room with its size, an exam's estimated need
 * hatched where it would go (an estimate, not a verdict). Under it, as macOS Settings: every part
 * listed with its whole name, and the details of the one picked (`open`)
 * beside them. A stretch of the bar picks its part too
 */
export function MemoryMap({
	totalMb,
	parts,
	estimate,
	open,
	onOpen,
	details,
}: {
	totalMb: number;
	parts: Part[];
	/** An exam's comfortable need, to compare with the free room: what
	 * (`A CKA exam`) and how much */
	estimate: { what: string; mb: number } | null;
	/** The part whose details show */
	open: string | null;
	onOpen: (key: string) => void;
	details: (part: Part) => ReactNode;
}) {
	const used = parts.reduce((n, p) => n + p.mb, 0);
	const free = Math.max(0, totalMb - used);
	const tight = estimate !== null && estimate.mb > free;
	const picked = parts.find(p => p.key === open);
	return (
		<Card padding="none" className="divide-y divide-border overflow-hidden">
			<div className="flex flex-col gap-2.5 p-3">
				<UsageBar
					label={`What uses Docker's memory: ${memory(used)} used, ${memory(free)} free`}
					total={totalMb}
					segments={parts.map(p => ({
						key: p.key,
						label: p.label,
						value: p.mb,
						className: COLOUR[p.kind],
					}))}
					format={memory}
					selected={open}
					onSelect={onOpen}
					mark={estimate && { value: estimate.mb, tight }}
				/>
				{estimate && (
					<p
						className={cn(
							"flex items-center gap-1.5 text-caption text-muted-foreground",
							tight && "text-warning"
						)}
					>
						<UsageMarkKey tight={tight} />
						{estimate.what}, about {memory(estimate.mb)}
						{tight && ": more than is free"}
					</p>
				)}
			</div>
			{/* The parts, and the details of the one picked beside them */}
			<div className="grid grid-cols-[minmax(12rem,15rem)_1fr]">
				<nav
					aria-label="What uses Docker's memory"
					className="flex flex-col gap-0.5 border-border border-r p-1.5"
				>
					{parts.map(part => (
						<SidebarItem
							key={part.key}
							icon={<Swatch className={COLOUR[part.kind]} />}
							label={part.label}
							detail={`${memory(part.mb)} · ${WHAT[part.kind]}`}
							current={part.key === open}
							onClick={() => onOpen(part.key)}
						/>
					))}
				</nav>
				<section aria-label={picked?.label} className="min-w-0 p-3">
					{picked && (
						// Keyed by the part: another picked eases in
						<div key={picked.key} className="animate-swap">
							<div className="mb-1 flex items-baseline gap-2">
								<h3 className="font-semibold text-sm">{picked.label}</h3>
								<span className="ml-auto text-caption text-muted-foreground tabular-nums">
									{memory(picked.mb)}
								</span>
							</div>
							{details(picked)}
						</div>
					)}
				</section>
			</div>
		</Card>
	);
}
