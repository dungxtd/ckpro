import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { useEffect } from "react";
import { useExam } from "@/stores/exam";
import type { ExamSummary } from "@/tauri/api";

const CERT_ORDER = ["cka", "ckad", "cks"];

function ExamCard({ exam }: { exam: ExamSummary }) {
	const start = useExam(s => s.start);
	return (
		<section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
			<header className="flex items-start gap-2">
				<strong className="flex-1">{exam.title}</strong>
				<Badge>{exam.certification.toUpperCase()}</Badge>
			</header>
			<p className="line-clamp-3 text-muted-foreground text-sm">{exam.description}</p>
			<div className="text-muted-foreground text-xs">
				{exam.questions} questions · {exam.duration_minutes} min · pass {exam.pass_score}%
			</div>
			<div className="mt-auto flex gap-2 pt-2">
				<Button size="sm" onClick={() => start(exam.id, "exam")}>
					Start exam
				</Button>
				<Button size="sm" variant="outline" onClick={() => start(exam.id, "practice")}>
					Practice
				</Button>
			</div>
		</section>
	);
}

/** Every exam of the bundled pack, grouped by certification. */
export function CatalogRoute() {
	const { catalog, loadCatalog, pendingReplace, start, cancelReplace, error } = useExam();
	useEffect(() => {
		loadCatalog();
	}, [loadCatalog]);

	const certs = [...new Set(catalog.map(e => e.certification))].sort(
		(a, b) => CERT_ORDER.indexOf(a) - CERT_ORDER.indexOf(b)
	);
	return (
		<div className="flex flex-col gap-6 p-6">
			{pendingReplace && (
				<div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
					<span className="flex-1">{pendingReplace.message}</span>
					<Button size="sm" onClick={() => start(pendingReplace.id, pendingReplace.mode, true)}>
						Replace and start
					</Button>
					<Button size="sm" variant="ghost" onClick={cancelReplace}>
						Cancel
					</Button>
				</div>
			)}
			{error && (
				<div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</div>
			)}
			{certs.map(cert => (
				<section key={cert}>
					<h2 className="mb-3 font-semibold text-lg">{cert.toUpperCase()}</h2>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
						{catalog
							.filter(e => e.certification === cert)
							.map(exam => (
								<ExamCard key={exam.id} exam={exam} />
							))}
					</div>
				</section>
			))}
		</div>
	);
}
