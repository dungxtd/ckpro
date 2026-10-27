import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Input } from "@ckdry/ui/components/input";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { useActivityList } from "@/stores/activity";
import { useExam } from "@/stores/exam";
import {
	ApiError,
	type CoachStatus,
	coachApi,
	type Difficulty,
	type Generated,
	type GeneratorTarget,
	generatorApi,
} from "@/tauri/api";

const label = (domain: string) => domain.replaceAll("-", " ").replace(/^./, c => c.toUpperCase());

/**
 * "Generate a question": the coach writes one for a certification's domain,
 * ckdry proves it on a cluster (every check fails before the solution and
 * passes after it), and it joins "My questions".
 */
export function GenerateCard({ onGenerated }: { onGenerated: () => void }) {
	const [targets, setTargets] = useState<GeneratorTarget[]>([]);
	const [status, setStatus] = useState<CoachStatus | null>(null);
	const [cert, setCert] = useState("cka");
	const [domain, setDomain] = useState("");
	const [difficulty, setDifficulty] = useState<Difficulty>("medium");
	const [topic, setTopic] = useState("");
	const [running, setRunning] = useState(false);
	const [done, setDone] = useState<Generated | null>(null);
	const [error, setError] = useState<string | null>(null);
	const start = useExam(s => s.start);
	// Its progress is the newest generator activity
	const activity = useActivityList().find(a => a.title.startsWith("Generate a"));

	useEffect(() => {
		generatorApi.targets().then(setTargets);
		coachApi.status().then(setStatus);
	}, []);
	const target = targets.find(t => t.certification === cert);
	useEffect(() => {
		setDomain(target?.domains[0]?.[0] ?? "");
	}, [target]);

	const generate = async () => {
		setRunning(true);
		setError(null);
		setDone(null);
		try {
			setDone(await generatorApi.generate({ certification: cert, domain, difficulty, topic }));
			onGenerated();
		} catch (e) {
			setError(e instanceof ApiError ? e.message : String(e));
		} finally {
			setRunning(false);
		}
	};

	if (targets.length === 0) return null;
	return (
		<Card className="flex flex-col gap-3">
			<header className="flex items-center gap-2">
				<Sparkles className="size-4 text-highlight" />
				<strong className="flex-1">Generate a question</strong>
				<SegmentedControl
					label="Certification"
					value={cert}
					onChange={setCert}
					options={targets.map(t => ({
						value: t.certification,
						label: t.certification.toUpperCase(),
					}))}
				/>
			</header>
			<p className="text-muted-foreground text-sm">
				The coach writes a task for the domain you pick; ckdry proves it on a cluster of its own
				(every check fails before the solution and passes after it) and adds it to My questions. A
				few minutes.
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Select value={domain} onValueChange={setDomain}>
					<SelectTrigger aria-label="Domain" className="min-w-48">
						<SelectValue placeholder="Domain" />
					</SelectTrigger>
					<SelectContent>
						{target?.domains.map(([d, weight]) => (
							<SelectItem key={d} value={d}>
								{label(d)} · {weight}%
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<SegmentedControl
					label="Difficulty"
					value={difficulty}
					onChange={setDifficulty}
					options={[
						{ value: "easy", label: "Easy" },
						{ value: "medium", label: "Medium" },
						{ value: "hard", label: "Hard" },
					]}
				/>
			</div>
			<Input
				value={topic}
				onChange={e => setTopic(e.target.value)}
				placeholder="Topic (optional), e.g. a NetworkPolicy that only allows DNS and one service"
				aria-label="Topic"
			/>
			<div className="flex items-center gap-2">
				<Button
					size="push"
					variant="pushDefault"
					disabled={running || !domain || (status !== null && !status.ready)}
					onClick={generate}
				>
					<Sparkles /> {running ? "Generating…" : "Generate"}
				</Button>
				{status && !status.ready && (
					<span className="text-muted-foreground text-xs">{status.problem}</span>
				)}
			</div>
			{running && activity && <ActivityProgress id={activity.id} compact />}
			{error && <Alert variant="destructive">{error}</Alert>}
			{done && (
				<Alert variant="success" className="items-center">
					<span className="flex-1">
						Proven and added: <strong>{done.title}</strong>
					</span>
					<Button size="push" variant="push" onClick={() => start(done.exam_id, "practice")}>
						Practice My questions
					</Button>
				</Alert>
			)}
		</Card>
	);
}
