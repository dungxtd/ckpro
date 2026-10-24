import { Badge } from "@ckdry/ui/components/badge";
import { Card } from "@ckdry/ui/components/card";
import { useEffect, useState } from "react";
import { examApi, type HistoryEntry } from "@/tauri/api";

/** Past attempts, newest first. */
export function HistoryRoute() {
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	useEffect(() => {
		examApi.history().then(setHistory);
	}, []);

	if (history.length === 0)
		return <div className="p-6 text-muted-foreground text-sm">No attempts yet.</div>;
	return (
		<div className="p-6">
			<Card padding="none" className="overflow-hidden">
				<table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
					<thead className="bg-muted/50 text-left text-muted-foreground text-xs">
						<tr>
							<th className="font-medium">Date</th>
							<th className="font-medium">Exam</th>
							<th className="font-medium">Mode</th>
							<th className="font-medium">Score</th>
							<th className="font-medium">Result</th>
						</tr>
					</thead>
					<tbody>
						{history.map(h => (
							<tr key={h.attempt_id} className="border-border border-t">
								<td className="tabular-nums">
									{new Date(h.result.started_at ?? 0).toLocaleString()}
								</td>
								<td>{h.title}</td>
								<td className="capitalize">{h.mode}</td>
								<td className="tabular-nums">{h.result.score}%</td>
								<td>
									<Badge variant={h.result.passed ? "success" : "destructive"}>
										{h.result.passed ? "Pass" : "Fail"}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Card>
		</div>
	);
}
