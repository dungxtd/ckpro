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
			<table className="w-full text-sm">
				<thead className="text-left text-muted-foreground">
					<tr>
						<th className="py-1">Date</th>
						<th>Exam</th>
						<th>Mode</th>
						<th>Score</th>
						<th>Result</th>
					</tr>
				</thead>
				<tbody>
					{history.map(h => (
						<tr key={h.attempt_id} className="border-border border-t">
							<td className="py-1.5">{new Date(h.result.started_at ?? 0).toLocaleString()}</td>
							<td>{h.title}</td>
							<td>{h.mode}</td>
							<td className="tabular-nums">{h.result.score}%</td>
							<td className={h.result.passed ? "text-green-500" : "text-red-500"}>
								{h.result.passed ? "PASS" : "FAIL"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
