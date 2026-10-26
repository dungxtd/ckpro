import { Alert } from "@ckdry/ui/components/alert";
import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { useEffect } from "react";
import { GenerateCard } from "@/components/catalog/generate-card";
import { useExam } from "@/stores/exam";
import type { ExamSummary } from "@/tauri/api";

const CERT_ORDER = ["cka", "ckad", "cks"];

function ExamCard({ exam }: { exam: ExamSummary }) {
	const start = useExam(s => s.start);
	return (
		<Card className="flex flex-col gap-2">
			<header className="flex items-start gap-2">
				<strong className="flex-1">{exam.title}</strong>
				<Badge>{exam.certification.toUpperCase()}</Badge>
			</header>
			<p className="line-clamp-3 text-muted-foreground text-sm">{exam.description}</p>
			<div className="text-muted-foreground text-xs">
				{exam.questions} question{exam.questions === 1 ? "" : "s"} · {exam.duration_minutes} min ·
				pass {exam.pass_score}%
			</div>
			<div className="mt-auto flex gap-2 pt-2">
				<Button size="sm" onClick={() => start(exam.id, "exam")}>
					Start exam
				</Button>
				<Button size="sm" variant="outline" onClick={() => start(exam.id, "practice")}>
					Practice
				</Button>
			</div>
		</Card>
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
				<Alert variant="warning" className="items-center gap-3">
					<span className="flex-1">{pendingReplace.message}</span>
					<Button size="sm" onClick={() => start(pendingReplace.id, pendingReplace.mode, true)}>
						Replace and start
					</Button>
					<Button size="sm" variant="ghost" onClick={cancelReplace}>
						Cancel
					</Button>
				</Alert>
			)}
			{error && <Alert variant="destructive">{error}</Alert>}
			<GenerateCard onGenerated={loadCatalog} />
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
