import { Badge } from "@ckdry/ui/components/badge";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Loading } from "@ckdry/ui/components/loading";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckdry/ui/components/table";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { AttemptChats } from "@/components/history/attempt-chats";
import { DomainScores } from "@/components/history/domain-scores";
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

	if (history === null) return <Loading fill label="Loading history…" />;
	if (history.length === 0)
		return <div className="p-6 text-muted-foreground text-sm">No attempts yet.</div>;
	return (
		<div className="flex flex-col gap-6 p-6">
			<DomainScores />
			<h2 className="-mb-3 font-semibold">Attempts</h2>
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
		</div>
	);
}
