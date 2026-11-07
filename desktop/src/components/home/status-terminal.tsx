import { Terminal } from "@cktry/ui/components/terminal";
import { useState } from "react";
import { type Event, predicted } from "@/components/study/data";
import { addDays, dayKey } from "@/days";
import { useSettings } from "@/stores/settings";
import type { ExamReadiness, ExamTarget } from "@/tauri/api";
import { commandFor, PROMPT, runCommand } from "./command";

const pad = (s: string | number, n: number) => String(s).padEnd(n, " ");

/**
 * Where the preparation stands, as `kubectl get` would print it: the exam
 * aimed at, its day, the predicted score against the pass line (once enough
 * is measured), and the events that stand out. Its last line is a prompt,
 * `kubectl set exam` typed already and a filled-in command suggested after
 * the caret (Tab takes it): Enter sets the target, `kubectl delete exam`
 * removes it
 */
export function StatusTerminal({
	target,
	days,
	readiness,
	events,
	certifications,
	certification,
}: {
	target: ExamTarget | null;
	days: number | null;
	readiness: ExamReadiness | null;
	events: Event[];
	/** The certifications a target may name */
	certifications: string[];
	/** The one suggested when there is no target yet */
	certification: string | null;
}) {
	const update = useSettings(s => s.update);
	const [line, setLine] = useState(PROMPT);
	const [last, setLast] = useState<{ line: string; output: string; failed: boolean } | null>(null);

	const score = predicted(readiness);
	const pass = readiness?.pass_score ?? 66;
	const status =
		score === null
			? readiness?.coverage
				? "Measuring"
				: "NoResults"
			: score >= pass
				? "OnTrack"
				: "BelowPass";
	const today = dayKey(new Date());
	const defaultDate = dayKey(addDays(new Date(), 60));
	const suggested = commandFor(
		target ?? {
			certification: certification ?? certifications[0] ?? "cka",
			date: defaultDate,
			rest_days: [],
		}
	);
	const comment = !suggested.startsWith(line)
		? target
			? "Enter changes it"
			: "Enter sets your target"
		: line === suggested
			? "Enter sets it"
			: "Tab fills it in";

	const run = () => {
		const done = runCommand(line, { certifications, current: target, today, defaultDate });
		if (done.kind === "set") update({ target: done.target });
		if (done.kind === "delete") update({ target: null });
		setLast(
			done.kind === "none" ? null : { line, output: done.output, failed: done.kind === "error" }
		);
		setLine(PROMPT);
	};

	return (
		<Terminal className="flex flex-col whitespace-pre-wrap">
			<span>
				<Terminal.Command>kubectl get exam {target?.certification ?? ""}</Terminal.Command>
				{"\n"}
				{target ? (
					<>
						{`${pad("NAME", 7)}${pad("DATE", 12)}${pad("DAYS", 6)}${pad("PREDICTED", 11)}${pad("PASS", 6)}STATUS\n`}
						{`${pad(target.certification, 7)}${pad(target.date, 12)}${pad(days ?? "", 6)}`}
						<Terminal.Ok>{pad(score === null ? "-" : `${Math.round(score)}%`, 11)}</Terminal.Ok>
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
					<Terminal.Muted>No resources found. Set the exam you prepare for below.</Terminal.Muted>
				)}
				{"\n\n"}
				<Terminal.Command>kubectl get events</Terminal.Command>
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
							{`${pad(e.reason, 13)}${e.message}\n`}
						</span>
					))
				)}
				{last && (
					<>
						{"\n"}
						<Terminal.Command>{last.line}</Terminal.Command>
						{"\n"}
						{last.failed ? <Terminal.Bad>{last.output}</Terminal.Bad> : last.output}
						{"\n"}
					</>
				)}
			</span>
			{/* Pushed to the bottom: the command line, typed already */}
			<Terminal.Prompt
				className="mt-auto pt-3"
				label="Command, for example kubectl set exam cka --date 2026-12-15"
				value={line}
				onChange={setLine}
				onSubmit={run}
				initial={PROMPT}
				suggestion={suggested}
				comment={comment}
				autoFocus={!target}
			/>
		</Terminal>
	);
}
