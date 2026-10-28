import { Badge } from "@ckdry/ui/components/badge";
import { Loading } from "@ckdry/ui/components/loading";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckdry/ui/components/table";
import { useEffect, useState } from "react";
import { StudyPlan } from "@/components/history/study-plan";
import { useAssistantEnabled } from "@/stores/settings";
import { examApi, type HistoryEntry } from "@/tauri/api";

/** Past attempts, newest first. */
export function HistoryRoute() {
	const assistant = useAssistantEnabled();
	const [history, setHistory] = useState<HistoryEntry[] | null>(null);
	useEffect(() => {
		examApi.history().then(setHistory);
	}, []);

	if (history === null) return <Loading fill label="Loading history…" />;
	if (history.length === 0)
		return <div className="p-6 text-muted-foreground text-sm">No attempts yet.</div>;
	return (
		<div className="flex flex-col gap-6 p-6">
			{assistant && <StudyPlan />}
			<h2 className="-mb-3 font-semibold">Attempts</h2>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead>Exam</TableHead>
						<TableHead>Mode</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Result</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{history.map(h => (
						<TableRow key={h.attempt_id}>
							<TableCell className="tabular-nums">
								{new Date(h.result.started_at ?? 0).toLocaleString()}
							</TableCell>
							<TableCell>{h.title}</TableCell>
							<TableCell className="capitalize">{h.mode}</TableCell>
							<TableCell className="tabular-nums">{h.result.score}%</TableCell>
							<TableCell>
								<Badge variant={h.result.passed ? "success" : "destructive"}>
									{h.result.passed ? "Pass" : "Fail"}
								</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
