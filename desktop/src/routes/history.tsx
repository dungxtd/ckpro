import { Badge } from "@ckpro/ui/components/badge";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Loading } from "@ckpro/ui/components/loading";
import { Placeholder, SampleRows } from "@ckpro/ui/components/placeholder";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckpro/ui/components/table";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { AttemptChats } from "@/components/history/attempt-chats";
import { DomainScores } from "@/components/history/domain-scores";
import { Screen } from "@/components/shell/screen";
import { coachApi, examApi, type HistoryEntry } from "@/tauri/api";

/** Past attempts, newest first. */
export function HistoryRoute() {
	const [history, setHistory] = useState<HistoryEntry[] | null>(null);
	// Attempts with assistant sessions, and the one being read back
	const [chatted, setChatted] = useState<Set<string>>(new Set());
	const [reading, setReading] = useState<HistoryEntry | null>(null);
	useEffect(() => {
		examApi.history().then(setHistory);
		coachApi.coachedAttempts().then(ids => setChatted(new Set(ids)));
	}, []);

	if (history === null) return <Loading fill label="Loading your attempts…" />;
	if (history.length === 0)
		return (
			<Screen title="History" width="wide">
				<Placeholder
					sample={<SampleRows rows={6} />}
					title="No attempts yet"
					description="Your exams and practice show here, with what to work on."
				/>
			</Screen>
		);
	return (
		<Screen title="History" width="wide">
			<DomainScores />
			<SectionTitle className="-mb-3">Attempts</SectionTitle>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead>Exam</TableHead>
						<TableHead>Mode</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Result</TableHead>
						<TableHead>
							<span className="sr-only">Assistant</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{history.map(h => (
						<TableRow key={h.attempt_id}>
							<TableCell className="whitespace-nowrap tabular-nums">
								{new Date(h.result.started_at ?? 0).toLocaleString(undefined, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</TableCell>
							<TableCell>{h.title}</TableCell>
							<TableCell className="capitalize">{h.mode}</TableCell>
							<TableCell className="tabular-nums">{h.result.score}%</TableCell>
							<TableCell>
								<Badge variant={h.result.passed ? "success" : "destructive"}>
									{h.result.passed ? "Passed" : "Failed"}
								</Badge>
							</TableCell>
							<TableCell className="w-10 text-right">
								<IconButton
									variant="toolbar"
									size="xs"
									aria-label={
										chatted.has(h.attempt_id) ? "Assistant sessions" : "No assistant sessions"
									}
									disabled={!chatted.has(h.attempt_id)}
									onClick={() => setReading(h)}
								>
									<History />
								</IconButton>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<AttemptChats entry={reading} onOpenChange={open => !open && setReading(null)} />
		</Screen>
	);
}
