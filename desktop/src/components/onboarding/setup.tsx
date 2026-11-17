import { Button } from "@ckpro/ui/components/button";
import { Spinner } from "@ckpro/ui/components/spinner";
import { Switch } from "@ckpro/ui/components/switch";
import { easeDrop, reducedMotion } from "@ckpro/ui/lib/motion";
import { linux, mac } from "@ckpro/ui/lib/platform";
import { cn } from "@ckpro/ui/lib/utils";
import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { ExamAsker, type ExamTold } from "@/components/study/exam-asker";
import { ExamTicket } from "@/components/study/exam-ticket";
import { dayKey } from "@/days";
import { useEnvironment } from "@/stores/environment";
import { useCatalog, useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { type ExamSummary, type ExamTarget, envApi } from "@/tauri/api";
import { certName, certRole, examDayText, plural } from "@/words";

type Step = "docker" | "exams" | "assistant" | "ready";
/** The steps in their order, all of them (the first practice is not always one) */
const ORDER: Step[] = ["docker", "exams", "assistant", "ready"];
const NAME: Record<Step, string> = {
	docker: "Docker",
	exams: "Your exams",
	assistant: "Assistant",
	ready: "First practice",
};
const CERTS = ["cka", "ckad", "cks"];
/** Memory an exam's clusters need to run, GB */
const ENOUGH_GB = 4;
/** The engines to suggest, as the system has them */
const ENGINES = mac
	? "OrbStack, Docker Desktop, Colima or Rancher Desktop"
	: linux
		? "Docker Engine, Docker Desktop or Rancher Desktop"
		: "Docker Desktop or Rancher Desktop";

/** How far a step slides as it goes and comes, px */
const SLIDE = 60;

/**
 * After the greeting, a few short steps: Docker found (or how to get it),
 * the exams prepared for and their days (each day set prints its ticket),
 * the assistant and usage sharing, then the first practice, only when
 * Docker runs and there is one to start. Each choice is saved as it is
 * made; `onDone` once finished, `start` with the first practice. Steps
 * slide one way on, the other back; a dot goes back to a step seen. Each
 * step reached is kept (Settings' `setup_step`): quit midway, the app
 * opens the setup there again. The
 * exam images download all the while, shown at the foot
 */
export function Setup({ onDone }: { onDone: (start?: { id: string; title: string }) => void }) {
	const docker = useEnvironment(s => s.env?.docker);
	const up = docker?.state === "up";
	const catalog = useCatalog();
	const targets = useSettings(s => s.settings.targets);
	const first = firstPractice(catalog, targets);
	// The first practice only when it can start: Docker running, one to start
	const steps: Step[] = [
		"docker",
		"exams",
		"assistant",
		...(up && first ? ["ready" as const] : []),
	];
	// The step shown and the furthest seen, by name: where the setup was left
	// (the app quit midway) holds while Docker and the exams are still read,
	// and the first practice, not there yet, is shown once it is
	const update = useSettings(s => s.update);
	const [left] = useState<Step>(() => {
		const saved = useSettings.getState().settings.setup_step as Step | null;
		return saved && ORDER.includes(saved) ? saved : "docker";
	});
	const [at, setAt] = useState<Step>(left);
	const [seen, setSeen] = useState<Step>(left);
	const [dir, setDir] = useState(1);
	const body = useRef<HTMLDivElement>(null);
	const moving = useRef(false);
	// A step not there (yet): the last of those that are
	const step = steps.includes(at) ? steps.indexOf(at) : steps.length - 1;
	const id = steps[step] as Step;
	const last = step === steps.length - 1;
	const seenAt = ORDER.indexOf(seen);

	/** To step `to`: the one shown slides off, then the next slides in */
	const go = async (to: number) => {
		if (moving.current || to === step || to < 0 || to >= steps.length) return;
		const by = to > step ? 1 : -1;
		const el = body.current;
		if (el && !reducedMotion()) {
			moving.current = true;
			await el
				.animate(
					[
						{ opacity: 1, transform: "none" },
						{ opacity: 0, transform: `translateX(${-by * SLIDE}px)` },
					],
					{ duration: 200, easing: easeDrop, fill: "forwards" }
				)
				.finished.catch(() => {});
			moving.current = false;
		}
		const next = steps[to] as Step;
		setDir(by);
		setAt(next);
		setSeen(s => (ORDER.indexOf(next) > ORDER.indexOf(s) ? next : s));
		update({ setup_step: next });
	};

	return (
		<div className="flex h-full flex-col items-center justify-center p-8">
			<div
				key={id}
				ref={body}
				style={{ "--slide": `${dir * SLIDE}px` } as CSSProperties}
				className="flex w-full max-w-130 animate-slide flex-col gap-6"
			>
				{id === "docker" && <DockerStep />}
				{id === "exams" && <ExamsStep />}
				{id === "assistant" && <AssistantStep later={!up} />}
				{id === "ready" && first && <ReadyStep first={first} onDone={onDone} />}
				<div className="flex items-center gap-2">
					{step > 0 && (
						<Button size="push" variant="push" onClick={() => go(step - 1)}>
							Back
						</Button>
					)}
					<span className="flex-1" />
					{id === "docker" && !up && (
						<Button size="push" variant="push" onClick={() => go(1)}>
							Set up later
						</Button>
					)}
					{id === "ready" && (
						<Button size="push" variant="push" onClick={() => onDone()}>
							Go to Home
						</Button>
					)}
					{id !== "ready" &&
						(last ? (
							<Button size="push" variant="pushDefault" onClick={() => onDone()}>
								Finish
							</Button>
						) : (
							<Button
								size="push"
								variant={id === "exams" && targets.length === 0 ? "push" : "pushDefault"}
								disabled={id === "docker" && !up}
								onClick={() => go(step + 1)}
							>
								{id === "exams" && targets.length === 0 ? "Skip for now" : "Continue"}
							</Button>
						))}
				</div>
			</div>
			{/* A dot goes back to a step already seen */}
			<ol aria-label="Setup steps" className="mt-8 flex gap-1">
				{steps.map((s, i) => (
					<li key={s}>
						<button
							type="button"
							aria-current={i === step ? "step" : undefined}
							aria-label={NAME[s]}
							disabled={ORDER.indexOf(s) > seenAt || i === step}
							onClick={() => go(i)}
							className="group/dot grid h-4 place-items-center px-0.5 enabled:cursor-pointer"
						>
							<span
								className={cn(
									"block h-1.5 rounded-full transition-[width,background-color] duration-200",
									i === step
										? "w-5 bg-highlight"
										: "w-1.5 bg-foreground/20 group-enabled/dot:group-hover/dot:bg-foreground/45"
								)}
							/>
						</button>
					</li>
				))}
			</ol>
			<ImagesNote />
		</div>
	);
}

/** The first practice to offer: an opening exam of the first certification
 * aimed at (the CKA's when none is) */
function firstPractice(catalog: ExamSummary[], targets: ExamTarget[]) {
	const cert = CERTS.find(c => targets.some(t => t.certification === c)) ?? "cka";
	return catalog.find(e => e.certification === cert && !e.custom) ?? null;
}

function Head({ title, lead }: { title: string; lead: ReactNode }) {
	return (
		<div>
			<h2 className="font-bold text-title tracking-tight">{title}</h2>
			<p className="mt-2 text-callout text-muted-foreground">{lead}</p>
		</div>
	);
}

/** A row of a step: its state, what it is, a line under it, an action */
function Row({
	ok,
	title,
	detail,
	children,
}: {
	ok?: boolean;
	title: ReactNode;
	detail?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
			{ok !== undefined &&
				(ok ? (
					<CircleCheck className="size-5 shrink-0 text-success" aria-label="Ready" />
				) : (
					<CircleAlert className="size-5 shrink-0 text-warning" aria-label="Needs you" />
				))}
			<span className="min-w-0 flex-1">
				<span className="block text-sm">{title}</span>
				{detail && <span className="block text-caption text-muted-foreground">{detail}</span>}
			</span>
			{children}
		</div>
	);
}

/** Docker: the engine found and what it gives, or how to get one going */
function DockerStep() {
	const docker = useEnvironment(s => s.env?.docker);
	if (!docker || docker.state === "connecting")
		return (
			<>
				<Head
					title="Looking for Docker"
					lead="Each attempt runs its clusters, task host and exam desktop in Docker, on this computer."
				/>
				<Row
					title={
						<span className="flex items-center gap-2">
							<Spinner size="inline" /> Looking for a Docker engine
						</span>
					}
				/>
			</>
		);
	if (docker.state === "down")
		return (
			<>
				<Head
					title="No Docker engine is running"
					lead="Each attempt runs its clusters, task host and exam desktop in Docker. Any engine that speaks the Docker API will do."
				/>
				<Row ok={false} title="Start your Docker engine" detail={docker.reason}>
					<Button size="push" variant="push" onClick={() => envApi.retry()}>
						Check again
					</Button>
				</Row>
				<p className="text-caption text-muted-foreground">
					None installed? {ENGINES} all work; CKPro finds it once it runs.
				</p>
			</>
		);
	const gb = docker.memory_mb / 1024;
	const low = gb < ENOUGH_GB;
	return (
		<>
			<Head
				title={low ? `${docker.engine} needs more memory` : `${docker.engine} is ready`}
				lead={`Each attempt runs its clusters, task host and exam desktop in ${docker.engine}, on this computer.`}
			/>
			<div className="flex flex-col gap-2.5">
				<Row
					ok
					title={`${docker.engine} ${docker.version}`}
					detail={`Answers the Docker API · ${docker.cpus} CPUs`}
				/>
				<Row
					ok={!low}
					title={`${gb.toFixed(1)} GB of memory for Docker`}
					detail={
						low
							? `An exam's clusters need ${ENOUGH_GB} GB or more: give ${docker.engine} more in its settings`
							: `${ENOUGH_GB} GB or more: an exam's clusters fit`
					}
				/>
			</div>
		</>
	);
}

/**
 * The exams prepared for, one question at a time: which exam, whether it
 * is booked, then its day (typed; settled, it prints its ticket) or, not
 * booked yet, when to be ready by (a goal: its day is set once booked).
 * Nothing is filled in for the candidate. Each exam is kept as it is
 * answered; those kept are listed, and another can be added
 */
function ExamsStep() {
	const targets = useSettings(s => s.settings.targets);
	const update = useSettings(s => s.update);
	const today = dayKey(new Date());
	const left = CERTS.filter(c => !targets.some(t => t.certification === c));
	// No exam left (the last one removed): asked again
	const [adding, setAdding] = useState(false);
	const asking = adding || targets.length === 0;
	// A booked day prints its ticket, as the app's exam menu does; a goal not
	const [ticket, setTicket] = useState<ExamTarget | null>(null);
	const keep = ({ certification, date, booked }: ExamTold) => {
		const target: ExamTarget = { certification, date, started: today, rest_days: [] };
		update({ targets: [...targets.filter(t => t.certification !== certification), target] });
		if (booked) setTicket(target);
		setAdding(false);
	};
	const cksEarly =
		targets.some(t => t.certification === "cks") && !targets.some(t => t.certification === "cka");
	return (
		<>
			{ticket && (
				<ExamTicket
					key={`${ticket.certification}-${ticket.date}`}
					target={ticket}
					onDone={() => setTicket(null)}
				/>
			)}
			<Head
				title="Which exams are you preparing for?"
				lead="Each with its day: Home counts down to it and the Calendar plans toward it. Change them any time."
			/>
			<div className="flex flex-col gap-5">
				{/* Those kept, each with its day */}
				{targets.length > 0 && (
					<div className="flex flex-col gap-2">
						{CERTS.flatMap(c => targets.filter(t => t.certification === c)).map(t => (
							<Row
								key={t.certification}
								ok
								title={
									<span>
										<span className="font-semibold">{certName(t.certification)}</span>{" "}
										<span className="text-muted-foreground">{certRole(t.certification)}</span>
									</span>
								}
								detail={examDayText(t.date)}
							>
								<Button
									size="push"
									variant="push"
									onClick={() =>
										update({ targets: targets.filter(o => o.certification !== t.certification) })
									}
								>
									Remove
								</Button>
							</Row>
						))}
						{!asking && left.length > 0 && (
							<Button
								size="push"
								variant="push"
								className="self-start"
								onClick={() => setAdding(true)}
							>
								<Plus /> Another exam
							</Button>
						)}
					</div>
				)}
				{asking && (
					<ExamAsker
						certs={left}
						first={targets.length ? "Which other exam?" : "Which exam first?"}
						onTell={keep}
					/>
				)}
				{cksEarly && (
					<p className="text-caption text-warning">
						The CKS needs a passed CKA: aim at the CKA first, or have it already
					</p>
				)}
			</div>
		</>
	);
}

/** The assistant, off unless wanted, and usage sharing; with Docker not
 * running yet (`later`), the last step: how the first practice comes */
function AssistantStep({ later }: { later: boolean }) {
	const settings = useSettings(s => s.settings);
	const update = useSettings(s => s.update);
	return (
		<>
			<Head
				title="An assistant, if you want one"
				lead="Every feature works without it. On, Claude explains and explores the cluster in practice, with your OK; exams stay yours alone."
			/>
			<div className="flex flex-col gap-2.5">
				<Row title="Use the assistant" detail="Claude Code on this computer, its own sign-in">
					<Switch
						aria-label="Use the assistant"
						checked={settings.assistant_enabled}
						onCheckedChange={assistant_enabled => update({ assistant_enabled })}
					/>
				</Row>
				<Row
					title="Share anonymous usage"
					detail="Errors and what is used, never your answers; Settings › About"
				>
					<Switch
						aria-label="Share anonymous usage"
						checked={settings.analytics}
						onCheckedChange={analytics => update({ analytics })}
					/>
				</Row>
				{later && (
					<p className="text-caption text-muted-foreground">
						Once Docker runs, Home offers your first practice; the exam images download then.
					</p>
				)}
			</div>
		</>
	);
}

/** The first practice: an opening exam of the first certification aimed at */
function ReadyStep({
	first,
	onDone,
}: {
	first: ExamSummary;
	onDone: (start?: { id: string; title: string }) => void;
}) {
	const env = useEnvironment(s => s.env);
	const busy = useExam(s => s.pending !== null);
	const imagesIn = (env?.images_missing ?? []).length === 0 && !env?.images_downloading;
	return (
		<>
			<Head
				title="You're set"
				lead="Start with a practice: hints, checks and solutions at your own pace. Take it as an exam when it feels easy."
			/>
			<div className="flex flex-col gap-2.5">
				<Row
					title={<span className="font-semibold">{first.title}</span>}
					detail={`${certName(first.certification)} · ${plural(first.questions, "question")} · ${first.duration_minutes} min · practice`}
				>
					<Button
						size="push"
						variant="pushDefault"
						disabled={busy}
						onClick={() => onDone({ id: first.id, title: first.title })}
					>
						Start practice
					</Button>
				</Row>
				<p className="text-caption text-muted-foreground">
					{imagesIn
						? "The exam images are in: it starts at once."
						: "The exam images finish first: it starts as soon as they are in."}
				</p>
			</div>
		</>
	);
}

/** The exam images, downloading from the moment Docker answers, whatever
 * step is open (and on into the app, as an activity) */
function ImagesNote() {
	const env = useEnvironment(s => s.env);
	if (!env) return null;
	const up = env.docker.state === "up";
	const missing = env.images_missing ?? [];
	const text = !up
		? "The exam images wait for Docker"
		: env.images_downloading
			? "Downloading the exam images"
			: missing.length
				? `${plural(missing.length, "exam image")} to download`
				: "Exam images ready";
	return (
		<output className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-caption">
			{up && env.images_downloading ? (
				<Spinner size="inline" />
			) : up && !missing.length ? (
				<CircleCheck className="size-3.5 text-success" aria-hidden />
			) : (
				<CircleAlert className="size-3.5 text-warning" aria-hidden />
			)}
			{text}
		</output>
	);
}
