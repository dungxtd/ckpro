import { ModuleCard } from "@/components/home/modules/module-card";
import { passed, scoreOf } from "@/components/study/data";
import type { HistoryEntry } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { plural } from "@/words";

/** Attempts passed, and the best */
export function Passed({ history }: { history: HistoryEntry[] }) {
	const figures = passed(history);
	return (
		<ModuleCard>
			<span className="font-semibold text-success text-title tabular-nums leading-none">
				{figures.passed}
			</span>
			<span className="text-caption text-muted-foreground">
				of {plural(figures.of, "attempt")} passed
			</span>
			{figures.best && (
				<span className="mt-auto truncate text-caption text-muted-foreground">
					best {Math.round(scoreOf(figures.best))}% · {shortTitle(figures.best.title)}
				</span>
			)}
		</ModuleCard>
	);
}
