import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ExamDetail } from "@/components/catalog/exam-detail";
import { useSelection } from "@/components/catalog/exams";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { envApi } from "@/tauri/api";

/** The exam picked in the sidebar (the first until one is) */
export function CatalogRoute() {
	const { catalog, loadCatalog, pendingReplace, start, cancelReplace, error } = useExam();
	// Live, not a remembered error: it clears itself when Docker is back
	const docker = useEnvironment(s => s.env?.docker);
	// How to start it on this system, as Rust words it
	const dockerHint = useEnvironment(s => s.env?.issues.find(i => i.component === "docker")?.hint);
	// The exams once read (the list is kept between visits)
	const [loaded, setLoaded] = useState(catalog.length > 0);
	useEffect(() => {
		loadCatalog().finally(() => setLoaded(true));
	}, [loadCatalog]);
	const { exam, missing } = useSelection();
	const navigate = useNavigate();

	// Laid out as a `Screen` (reading): the same left edge as every screen
	return (
		<div className="flex max-w-3xl flex-col gap-6 px-8 pt-1 pb-10">
			{pendingReplace && (
				<Alert variant="warning" className="items-center gap-3">
					<span className="flex-1">{pendingReplace.message}</span>
					<Button
						size="sm"
						variant="pushDefault"
						onClick={() => start(pendingReplace.id, pendingReplace.mode, true)}
					>
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
						<strong>Docker is not running.</strong>{" "}
						{dockerHint ?? "ckpro connects as soon as it is up."}
					</span>
					<Button size="push" variant="push" onClick={() => envApi.retry()}>
						Retry now
					</Button>
				</Alert>
			)}
			{docker?.state === "connecting" && <Alert>Connecting to Docker…</Alert>}
			{error && <Alert variant="destructive">{error}</Alert>}
			{exam ? (
				// Each exam fades in, its description folded again
				<div key={exam.id} className="fade-in-0 animate-in duration-200 motion-reduce:animate-none">
					<ExamDetail exam={exam} dockerMb={docker?.state === "up" ? docker.memory_mb : null} />
				</div>
			) : missing ? (
				<Placeholder
					className="mt-16"
					sample={<div className="h-24 w-72 rounded-xl border border-border bg-card" />}
					title="This exam is not here any more"
					description="It was deleted, or the questions it used were."
					action={
						<Button size="push" variant="push" onClick={() => navigate("/exams")}>
							Show the exams
						</Button>
					}
				/>
			) : (
				!loaded && <Loading fill label="Loading exams…" />
			)}
		</div>
	);
}
