import { FadeScroll } from "@ckpro/ui/components/fade-scroll";
import { ModuleCard } from "@/components/home/modules/module-card";
import type { Retry } from "@/components/study/data";
import { useExam, useExamBusy } from "@/stores/exam";
import { shortTitle } from "@/titles";
import { certName, plural } from "@/words";

/** The most questions the shelf holds; History lists them all */
const SHELF = 12;

/** The questions whose last try failed checks, as a shelf; one practised from its card */
export function RetryList({ retries, several }: { retries: Retry[]; several: boolean }) {
	const askStart = useExam(s => s.askStart);
	// The exam a question is in, by its name in the catalog
	const catalog = useExam(s => s.catalog);
	const busy = useExamBusy();
	return (
		<ModuleCard
			title="Retry list"
			link={retries.length ? { to: "/history", label: `All ${retries.length}` } : undefined}
		>
			<p className="mb-2 text-caption text-muted-foreground">
				{retries.length
					? "Questions whose checks failed the last time"
					: "Questions whose checks fail come back here"}
			</p>
			{retries.length > 0 && (
				<FadeScroll axis="x" className="-mx-1 flex min-h-0 flex-1 gap-2.5 px-1">
					{retries.slice(0, SHELF).map(r => (
						<button
							key={r.id}
							type="button"
							disabled={busy}
							onClick={() =>
								askStart(
									r.examId,
									"practice",
									catalog.find(e => e.id === r.examId)?.title ?? r.title
								)
							}
							aria-label={`Practise ${shortTitle(r.title)} again`}
							className="flex w-36 shrink-0 flex-col justify-between rounded-xl bg-fill-quiet p-2.5 text-left hover:bg-hover disabled:opacity-60"
						>
							<b className="line-clamp-3 font-semibold text-caption">{r.title}</b>
							<span className="text-2xs text-muted-foreground">
								{several && `${certName(r.certification)} · `}
								{r.failed} of {plural(r.checks, "check")} failed
							</span>
						</button>
					))}
				</FadeScroll>
			)}
		</ModuleCard>
	);
}
