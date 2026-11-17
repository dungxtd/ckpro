// The updates, shown in the design system: a small window that plays each
// case step by step (what the candidate sees, what Rust does meanwhile), then
// every state side by side. Development only, as the gallery.
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Sidebar, SidebarItem } from "@ckpro/ui/components/sidebar";
import { cn } from "@ckpro/ui/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, House, LayoutList, Settings } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Timer } from "@/components/exam/timer";
import { UpdateGroup } from "@/components/settings/update-group";
import {
	Restarting,
	toastUpdated,
	UpdateChip,
	UpdateRequiredNotice,
} from "@/components/shell/update";
import type { UpdateInfo, UpdateStatus } from "@/stores/update";

const CURRENT = "0.3.2";
const NEXT = "0.4.0";
const MB = 1_048_576;
const NOTES =
	"- **Calendar:** plan a whole week at once\n- **Exam desk:** a resumed exam keeps its desktop size\n- **Fixes:** grading waits for a node that restarts";

const ready = (patch: Partial<Extract<UpdateStatus, { state: "ready" }>> = {}): UpdateStatus => ({
	state: "ready",
	version: NEXT,
	notes: NOTES,
	required: false,
	blocked: null,
	on_quit: true,
	...patch,
});

const manual = (patch: Partial<Extract<UpdateStatus, { state: "manual" }>> = {}): UpdateStatus => ({
	state: "manual",
	version: NEXT,
	notes: NOTES,
	required: false,
	reason: "This computer has no way to ask for your password (pkexec is missing)",
	url: `https://github.com/dungxtd/ckpro/releases/tag/v${NEXT}`,
	command: "sudo apt install ./ckpro_*_linux-x64.deb",
	...patch,
});

const downloading = (part: number): UpdateStatus => ({
	state: "downloading",
	version: NEXT,
	done: Math.round(96 * MB * part),
	total: 96 * MB,
});

type Screen = "home" | "about" | "desk";

interface Step {
	screen: Screen;
	status: UpdateStatus;
	/** What happens meanwhile, out of sight (Rust) */
	note: string;
	/** Runs on the new version: `updated_from` set, the toast shown */
	updated?: boolean;
	/** The candidate pressed Start exam here */
	start?: boolean;
	/** An exam-mode attempt runs: nothing about updates, on any screen */
	exam?: boolean;
}

const SCENARIOS: Record<string, { label: string; steps: Step[] }> = {
	normal: {
		label: "Normal",
		steps: [
			{
				screen: "home",
				status: { state: "idle", checked_at: null },
				note: "CKPro opens. Rust checks a minute later, after the environment is up, then every 6 hours.",
			},
			{
				screen: "home",
				status: { state: "checking" },
				note: "Rust reads latest.json from the latest GitHub release. An automatic check shows nothing.",
			},
			{
				screen: "about",
				status: downloading(0.31),
				note: "0.4.0 is newer: it downloads in the background, to the data folder. A ring in the corner shows how far; under the pointer, its words.",
			},
			{
				screen: "about",
				status: downloading(0.86),
				note: "An interrupted download starts again later; a file kept from an earlier run is not fetched again.",
			},
			{
				screen: "home",
				status: ready(),
				note: "Downloaded, its signature checked. The chip in the corner slides out its words by itself once, like a toast, and folds back after 8 s. A press on the words restarts; the × beside them puts it away (it still installs when CKPro quits). Quitting CKPro installs it too.",
			},
			{
				screen: "home",
				status: { state: "restarting", version: NEXT },
				note: "Restart: the guard pauses, Create's proof clusters are removed, the exam clusters keep running. Installed, CKPro starts again.",
			},
			{
				screen: "home",
				status: { state: "idle", checked_at: Date.now() },
				updated: true,
				note: "0.4.0 opens on the running environment: nothing to start again. 'Updated' shows once.",
			},
		],
	},
	attempt: {
		label: "During an attempt",
		steps: [
			{
				screen: "desk",
				status: ready({ blocked: "your exam" }),
				exam: true,
				note: "The update is ready while an exam runs. The exam desk shows nothing about it.",
			},
			{
				screen: "home",
				status: ready({ blocked: "your exam" }),
				exam: true,
				note: "Exam mode, away from the desk: still nothing, on any screen. The candidate is left to the exam; Rust keeps the update for later.",
			},
			{
				screen: "home",
				status: ready({ blocked: "your attempt" }),
				note: "Practice, away from the desk: the corner icon is grey and says it waits. Restart is refused while an attempt starts, runs or is graded.",
			},
			{
				screen: "home",
				status: ready({ blocked: "your attempt", on_quit: false }),
				note: "CKPro quit with the attempt still running: nothing installs, so the attempt resumes on the version that started it.",
			},
			{
				screen: "home",
				status: ready(),
				note: "The attempt is graded. Now a restart is offered, and the next quit installs it.",
			},
		],
	},
	required: {
		label: "Required",
		steps: [
			{
				screen: "desk",
				status: ready({ required: true, blocked: "your attempt" }),
				note: "latest.json says minimum_version 0.4.0, above 0.3.2. The running exam goes on: nothing shows on the desk.",
			},
			{
				screen: "home",
				status: ready({ required: true }),
				note: "The attempt is graded. Home asks for the restart; no new attempt starts on 0.3.2.",
			},
			{
				screen: "home",
				status: ready({ required: true }),
				start: true,
				note: "Start exam is refused by Rust with UpdateRequired; the interface says so.",
			},
			{
				screen: "home",
				status: { state: "restarting", version: NEXT },
				note: "Restart: clusters keep running, CKPro installs and starts again.",
			},
			{
				screen: "home",
				status: { state: "idle", checked_at: Date.now() },
				updated: true,
				note: "On 0.4.0: exams start again.",
			},
		],
	},
	deb: {
		label: ".deb by hand",
		steps: [
			{
				screen: "home",
				status: ready({ on_quit: false }),
				note: "A .deb install updates only from the restart: it asks for your password, so it never installs on quit.",
			},
			{
				screen: "home",
				status: { state: "restarting", version: NEXT },
				note: "Rust runs pkexec dpkg -i (or asks for the password through zenity or kdialog).",
			},
			{
				screen: "about",
				status: manual(),
				note: "No way to ask for the password: CKPro stays open on 0.3.2 and says how to install it by hand.",
			},
			{
				screen: "home",
				status: manual({ required: true }),
				note: "Required and installed by hand: Home points at the instructions. The same for an AppImage in a folder CKPro cannot write.",
			},
		],
	},
	failed: {
		label: "Check fails",
		steps: [
			{
				screen: "about",
				status: { state: "failed", message: "GitHub did not answer within 30 seconds" },
				note: "A check you asked for (Check now) failed: it says so. An automatic one stays quiet and tries again later.",
			},
			{
				screen: "about",
				status: { state: "checking" },
				note: "Try again.",
			},
			{
				screen: "about",
				status: { state: "idle", checked_at: Date.now() },
				note: "Up to date.",
			},
		],
	},
};

type ScenarioKey = keyof typeof SCENARIOS;

export function UpdateFlow() {
	const [scenario, setScenario] = useState<ScenarioKey>("normal");
	const [at, setAt] = useState(0);
	const [opened, setOpened] = useState<Screen | null>(null);
	const steps = SCENARIOS[scenario].steps;
	const step = steps[Math.min(at, steps.length - 1)];
	const screen = opened ?? step.screen;
	const info: UpdateInfo = {
		current: step.updated ? NEXT : CURRENT,
		status: step.status,
		dismissed: false,
		updated_from: step.updated ? CURRENT : null,
	};
	const next = () => setAt(a => Math.min(a + 1, steps.length - 1));
	// Each case announces its update once, as the app does once per run
	const [announced, setAnnounced] = useState(() => new Set<string>());
	const [dismissed, setDismissed] = useState(() => new Set<string>());

	// What a step shows once, as it opens: the update's toast, a refused start
	useEffect(() => {
		setOpened(null);
		if (step.updated) toastUpdated(NEXT, () => setOpened("about"));
		if (step.start) toast.error(`Update CKPro to ${NEXT} to start an exam`);
	}, [step]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<SegmentedControl
					label="Case"
					value={scenario}
					onChange={v => {
						setScenario(v);
						setAt(0);
						setAnnounced(new Set());
						setDismissed(new Set());
					}}
					options={Object.entries(SCENARIOS).map(([value, s]) => ({ value, label: s.label }))}
				/>
				<span className="ml-auto flex items-center gap-2">
					<span className="text-caption text-muted-foreground tabular-nums">
						Step {at + 1} of {steps.length}
					</span>
					<Button size="push" variant="push" disabled={at === 0} onClick={() => setAt(a => a - 1)}>
						<ChevronLeft /> Back
					</Button>
					<Button
						size="push"
						variant="pushDefault"
						disabled={at === steps.length - 1}
						onClick={next}
					>
						Next <ChevronRight />
					</Button>
				</span>
			</div>

			<Card padding="none" className="relative grid h-[460px] grid-cols-[auto_1fr] overflow-hidden">
				<Sidebar className="m-0 h-full rounded-none border-0 border-border border-r">
					<div className="flex min-h-0 flex-1 flex-col px-2 py-2">
						<SidebarItem
							icon={<House />}
							label="Home"
							current={screen === "home"}
							onClick={() => setOpened("home")}
						/>
						<SidebarItem icon={<CalendarDays />} label="Calendar" />
						<SidebarItem icon={<LayoutList />} label="Exams" />
					</div>
					<div className="border-border border-t p-2">
						<SidebarItem
							icon={<Settings />}
							label="Settings"
							current={screen === "about"}
							onClick={() => setOpened("about")}
						/>
					</div>
				</Sidebar>
				<div className="flex min-w-0 flex-col">
					{/* The title bar: what runs in the background and the update, in
					    the corner; never on the exam desk */}
					<div className="flex h-12 shrink-0 items-center justify-end gap-2 px-3">
						<UpdateChip
							status={step.status}
							onRestart={next}
							onCheck={next}
							onDownload={() => toast("Opens the release page in the browser")}
							onOpen={() => setOpened("about")}
							announced={announced}
							dismissed={dismissed.has(JSON.stringify(step.status))}
							onDismiss={() => setDismissed(d => new Set(d).add(JSON.stringify(step.status)))}
							hidden={screen === "desk" || step.exam === true}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
						{screen === "home" && (
							<HomeScreen status={step.status} onRestart={next} onOpen={() => setOpened("about")} />
						)}
						{screen === "about" && (
							<div className="mx-auto flex max-w-xl flex-col gap-4">
								<h3 className="font-semibold text-lg">About</h3>
								<UpdateGroup
									info={info}
									onCheck={next}
									onRestart={next}
									onDownload={() => toast("Opens the release page in the browser")}
								/>
							</div>
						)}
						{screen === "desk" && <DeskScreen />}
					</div>
				</div>
				{step.status.state === "restarting" && (
					<Restarting version={step.status.version} className="absolute" />
				)}
			</Card>

			<p className="rounded-lg bg-fill-quiet px-3 py-2 text-callout">
				<span className="font-medium">Meanwhile: </span>
				<span className="text-muted-foreground">{step.note}</span>
			</p>
		</div>
	);
}

function HomeScreen({
	status,
	onRestart,
	onOpen,
}: {
	status: UpdateStatus;
	onRestart: () => void;
	onOpen: () => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<h3 className="font-semibold text-lg">Home</h3>
			<UpdateRequiredNotice status={status} onRestart={onRestart} onOpen={onOpen} />
			<div className="grid grid-cols-2 gap-3">
				<Placeholder title="CKA exam day" detail="in 23 days" />
				<Placeholder title="Readiness" detail="71%, 3 domains measured" />
			</div>
		</div>
	);
}

function DeskScreen() {
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex items-center gap-3">
				<h3 className="flex-1 font-semibold text-lg">CKA practice exam, question 4 of 17</h3>
				<Timer startedAt={Date.now() - 1_800_000} endsAt={Date.now() + 5_400_000} />
			</div>
			<div className="grid flex-1 place-items-center rounded-lg border border-border border-dashed text-center text-callout text-muted-foreground">
				The exam desk: nothing about updates here, whatever their state.
			</div>
		</div>
	);
}

const Placeholder = ({ title, detail }: { title: string; detail: string }) => (
	<Card padding="sm">
		<div className="font-medium text-callout">{title}</div>
		<div className="text-caption text-muted-foreground">{detail}</div>
	</Card>
);

/** Every state at once: the corner's chip, its words out, and Settings >
 * About's group */
export function UpdateStates() {
	const states: [string, UpdateStatus][] = [
		["Up to date", { state: "idle", checked_at: Date.now() - 2 * 3_600_000 }],
		["Checking (asked)", { state: "checking" }],
		[
			"Check failed (asked)",
			{ state: "failed", message: "GitHub did not answer within 30 seconds" },
		],
		["Downloading", downloading(0.4)],
		["Ready", ready()],
		["Ready, held by an attempt", ready({ blocked: "your attempt" })],
		["Ready, required", ready({ required: true })],
		["By hand (.deb, AppImage)", manual()],
		["Installing", { state: "restarting", version: NEXT }],
	];
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
			{states.map(([name, status]) => (
				<Frame key={name} name={name}>
					<div className="flex h-9 items-center justify-end rounded-lg bg-fill-quiet px-2">
						<UpdateChip
							status={status}
							onRestart={() => {}}
							onCheck={() => {}}
							onDownload={() => {}}
							onOpen={() => {}}
							announced={NONE_ANNOUNCED}
							dismissed={false}
							onDismiss={() => {}}
							expanded
						/>
						{["idle", "checking"].includes(status.state) && (
							<span className="text-caption text-muted-foreground">nothing in the corner</span>
						)}
					</div>
					<UpdateGroup
						info={{ current: CURRENT, status, dismissed: false, updated_from: null }}
						onCheck={() => {}}
						onRestart={() => {}}
						onDownload={() => {}}
					/>
				</Frame>
			))}
		</div>
	);
}

/** The states shown side by side announce nothing by themselves */
const NONE_ANNOUNCED = new Set<string>([NEXT]);

const Frame = ({ name, children }: { name: string; children: ReactNode }) => (
	<div className={cn("flex flex-col gap-2 rounded-xl border border-border p-3")}>
		<code className="text-caption text-muted-foreground">{name}</code>
		{children}
	</div>
);
