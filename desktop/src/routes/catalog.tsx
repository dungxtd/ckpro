import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ExamDetail } from "@/components/catalog/exam-detail";
import { useSelection } from "@/components/catalog/exams";
import { DockerBanner } from "@/components/environment/docker-banner";
import { screenPage } from "@/components/shell/screen";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";

/** The exam picked in the sidebar (the first until one is) */
export function CatalogRoute() {
	const { catalog, loadCatalog, error } = useExam();
	const docker = useEnvironment(s => s.env?.docker);
	// The exams once read (the list is kept between visits)
	const [loaded, setLoaded] = useState(catalog.length > 0);
	useEffect(() => {
		loadCatalog().finally(() => setLoaded(true));
	}, [loadCatalog]);
	const { exam, missing } = useSelection();
	const navigate = useNavigate();

	// Laid out as a `Screen` (reading)
	return (
		<div className={screenPage()}>
			<DockerBanner />
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
