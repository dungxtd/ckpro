import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Loading } from "@ckpro/ui/components/loading";
import { Placeholder, SampleRows } from "@ckpro/ui/components/placeholder";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ExamDetail } from "@/components/catalog/exam-detail";
import { useSelection } from "@/components/catalog/exams";
import { DockerBanner } from "@/components/environment/docker-banner";
import { screenPage } from "@/components/shell/screen";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";

/** The exam picked in the sidebar (the first until one is) */
export function CatalogRoute() {
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	const error = useExam(s => s.error);
	const docker = useEnvironment(s => s.env?.docker);
	// The exams once read (the list is kept between visits)
	const [loaded, setLoaded] = useState(catalog.length > 0);
	const read = useCallback(() => loadCatalog().finally(() => setLoaded(true)), [loadCatalog]);
	useEffect(() => {
		read();
	}, [read]);
	const { exam, missing } = useSelection();
	const navigate = useNavigate();
	// Read, and none came: either the reading failed (say so, and offer it
	// again) or there are none (say how to make one)
	const empty = loaded && catalog.length === 0;

	// Laid out as a `Screen` (reading)
	return (
		<div className={screenPage()}>
			<DockerBanner />
			{error && empty ? (
				<Alert variant="destructive" className="flex-col items-start">
					<span className="font-medium">The exams could not be read.</span>
					<span className="text-caption text-muted-foreground">{error}</span>
					<Button size="push" variant="push" className="mt-1" onClick={read}>
						Try again
					</Button>
				</Alert>
			) : (
				error && <Alert variant="destructive">{error}</Alert>
			)}
			{exam ? (
				// Keyed: a new exam starts with its description folded again
				<ExamDetail
					key={exam.id}
					exam={exam}
					dockerMb={docker?.state === "up" ? docker.memory_mb : null}
				/>
			) : empty && !error ? (
				<Placeholder
					className="mt-16"
					sample={<SampleRows rows={3} />}
					title="No exams yet"
					description="Create builds one from the question bank, with the assistant."
					action={
						<Button size="push" variant="pushDefault" onClick={() => navigate("/create")}>
							Create an exam
						</Button>
					}
				/>
			) : missing ? (
				<Placeholder
					className="mt-16"
					sample={<Card className="h-24 w-72" />}
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
