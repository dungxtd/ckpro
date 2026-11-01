import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Loading } from "@ckdry/ui/components/loading";
import { useEffect, useState } from "react";
import { ExamDetail } from "@/components/catalog/exam-detail";
import { useSelection } from "@/components/catalog/exams";
import { GenerateCard } from "@/components/catalog/generate-card";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import { envApi } from "@/tauri/api";

/** The exam picked in the sidebar (the first until one is), or the question generator */
export function CatalogRoute() {
	const assistant = useAssistantEnabled();
	const { catalog, loadCatalog, pendingReplace, start, cancelReplace, error } = useExam();
	// Live, not a remembered error: it clears itself when Docker is back
	const docker = useEnvironment(s => s.env?.docker);
	// The exams once read (the list is kept between visits)
	const [loaded, setLoaded] = useState(catalog.length > 0);
	useEffect(() => {
		loadCatalog().finally(() => setLoaded(true));
	}, [loadCatalog]);
	const { exam, generating } = useSelection();

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 pt-2 pb-10">
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
			{docker?.state === "down" && (
				<Alert variant="warning" className="items-center">
					<span className="flex-1">
						<strong>Docker is not running.</strong> Start OrbStack or Docker Desktop: ckdry connects
						as soon as it is up.
					</span>
					<Button size="push" variant="push" onClick={() => envApi.retry()}>
						Retry now
					</Button>
				</Alert>
			)}
			{docker?.state === "connecting" && <Alert>Connecting to Docker…</Alert>}
			{error && <Alert variant="destructive">{error}</Alert>}
			{generating && assistant ? (
				<GenerateCard onGenerated={loadCatalog} />
			) : exam ? (
				// Each exam fades in, its description folded again
				<div key={exam.id} className="fade-in-0 animate-in duration-200 motion-reduce:animate-none">
					<ExamDetail exam={exam} dockerMb={docker?.state === "up" ? docker.memory_mb : null} />
				</div>
			) : (
				!loaded && <Loading fill label="Loading exams…" />
			)}
		</div>
	);
}
