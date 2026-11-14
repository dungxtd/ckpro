import { ModuleCard, ModuleScroll } from "@/components/home/modules/module-card";
import { scoreColor, scoreOf, startedAt, worked } from "@/components/study/data";
import type { HistoryEntry } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { certName, shortDay } from "@/words";

/** The latest attempts, a row each; the module grows with them, then scrolls */
export function Recent({ history, several }: { history: HistoryEntry[]; several: boolean }) {
	const rows = history.slice(0, 20);
	return (
		<ModuleCard
			title="Recent"
			link={history.length ? { to: "/history", label: `All ${history.length}` } : undefined}
		>
			{rows.length === 0 ? (
				<p className="text-caption text-muted-foreground">Your attempts show here</p>
			) : (
				<ModuleScroll>
					{rows.map(h => {
						const minutes = Math.round(
							((h.result.finished_at ?? startedAt(h)) - startedAt(h)) / 60_000
						);
						const score = scoreOf(h);
						return (
							<div
								key={h.attempt_id}
								className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto_3rem] items-center gap-3 border-border border-b py-1.5 text-caption last:border-0"
							>
								<span className="text-muted-foreground">{shortDay(new Date(startedAt(h)))}</span>
								<span className="truncate">{shortTitle(h.title)}</span>
								<span className="text-muted-foreground">
									{h.mode === "exam" ? "Exam" : "Practice"} · {minutes} min
									{several && h.certification ? ` · ${certName(h.certification)}` : ""}
								</span>
								<b
									className="text-right tabular-nums"
									style={{ color: worked(h) ? scoreColor(score, h.pass_score) : undefined }}
								>
									{Math.round(score)}%
								</b>
							</div>
						);
					})}
				</ModuleScroll>
			)}
		</ModuleCard>
	);
}
