import { Button } from "@ckdry/ui/components/button";
import { Terminal } from "@ckdry/ui/components/terminal";
import type { Event } from "@/components/study/data";
import type { ExamReadiness, ExamTarget } from "@/tauri/api";

const pad = (s: string | number, n: number) => String(s).padEnd(n, " ");

/**
 * Where the preparation stands, as `kubectl get` would print it: the exam
 * aimed at, its day, the predicted score against the pass line, and the
 * events that stand out. Without a target, how to set one
 */
export function StatusTerminal({
	target,
	days,
	readiness,
	events,
	onChangeTarget,
}: {
	target: ExamTarget | null;
	days: number | null;
	readiness: ExamReadiness | null;
	events: Event[];
	onChangeTarget: () => void;
}) {
	const predicted = readiness?.predicted;
	const pass = readiness?.pass_score ?? 66;
	const status = predicted == null ? "NoResults" : predicted >= pass ? "OnTrack" : "BelowPass";
	return (
		<div className="flex flex-col gap-3">
			<Terminal className="flex-1">
				<Terminal.Muted>$ kubectl get exam {target?.certification ?? ""}</Terminal.Muted>
				{"\n"}
				{target ? (
					<>
						{`${pad("NAME", 7)}${pad("DATE", 12)}${pad("DAYS", 6)}${pad("PREDICTED", 11)}${pad("PASS", 6)}STATUS\n`}
						{`${pad(target.certification, 7)}${pad(target.date, 12)}${pad(days ?? "", 6)}`}
						<Terminal.Ok>
							{pad(predicted == null ? "-" : `${Math.round(predicted)}%`, 11)}
						</Terminal.Ok>
						{pad(`${pass}%`, 6)}
						{status === "OnTrack" ? (
							<Terminal.Ok>{status}</Terminal.Ok>
						) : status === "BelowPass" ? (
							<Terminal.Warn>{status}</Terminal.Warn>
						) : (
							<Terminal.Muted>{status}</Terminal.Muted>
						)}
					</>
				) : (
					<Terminal.Muted>No resources found. Set the exam you prepare for.</Terminal.Muted>
				)}
				{"\n\n"}
				<Terminal.Muted>$ kubectl get events</Terminal.Muted>
				{"\n"}
				{events.length === 0 ? (
					<Terminal.Muted>No events yet: finish an attempt.</Terminal.Muted>
				) : (
					events.map(e => (
						<span key={`${e.reason}${e.message}`}>
							{e.type === "Normal" ? (
								<Terminal.Ok>{pad(e.type, 9)}</Terminal.Ok>
							) : (
								<Terminal.Warn>{pad(e.type, 9)}</Terminal.Warn>
							)}
							{`${pad(e.reason, 11)}${e.message}\n`}
						</span>
					))
				)}
			</Terminal>
			<div className="flex gap-2">
				<Button size="push" variant="push" onClick={onChangeTarget}>
					{target ? "Change target" : "Set a target"}
				</Button>
			</div>
		</div>
	);
}
