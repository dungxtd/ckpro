// The design system, live: every kit component and the app's own patterns,
// in both themes. Development only (`pnpm vite` → /kit.html); the app build
// does not include it. When a component or variant is added, add it here.
import { Alert } from "@ckdry/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ckdry/ui/components/alert-dialog";
import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Chip } from "@ckdry/ui/components/chip";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { Disclosure } from "@ckdry/ui/components/disclosure";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Input } from "@ckdry/ui/components/input";
import { Loading } from "@ckdry/ui/components/loading";
import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { Progress } from "@ckdry/ui/components/progress";
import { Range } from "@ckdry/ui/components/range";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { Separator } from "@ckdry/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@ckdry/ui/components/sheet";
import { Skeleton } from "@ckdry/ui/components/skeleton";
import { Toaster } from "@ckdry/ui/components/sonner";
import { Spinner } from "@ckdry/ui/components/spinner";
import { Stepper } from "@ckdry/ui/components/stepper";
import { Switch } from "@ckdry/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckdry/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ckdry/ui/components/tabs";
import { Textarea } from "@ckdry/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckdry/ui/components/tooltip";
import { Truncated } from "@ckdry/ui/components/truncated";
import {
	Check,
	ChevronDown,
	CircleAlert,
	Info,
	Lightbulb,
	Monitor,
	Plus,
	Settings,
	Sparkles,
	TriangleAlert,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { ActivityStatusIcon } from "@/components/activity/activity-status-icon";
import { StatusDot } from "@/components/environment/status-dot";
import { Answer } from "@/components/exam/answer";
import { CheckList } from "@/components/exam/check-list";
import { CopyBlock, CopyText } from "@/components/exam/copy-text";
import { Timer } from "@/components/exam/timer";
import "../index.css";

// The app's commands answer nothing here
(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
	invoke: async () => null,
	transformCallback: () => 0,
};

const TOKENS = [
	"background",
	"foreground",
	"card",
	"muted",
	"muted-foreground",
	"accent",
	"border",
	"primary",
	"highlight",
	"success",
	"warning",
	"destructive",
	"exam-value",
	"exam-concept",
];

const LONG_LOG = [
	"▸ Starting cluster k8s",
	"✗ Docker is not running. Start OrbStack or Docker Desktop and try again; this line is long on purpose to show how a log wraps instead of scrolling sideways.",
].join("\n");

function Gallery() {
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [seg, setSeg] = useState("desktop");
	const [step, setStep] = useState(100);
	const [range, setRange] = useState(40);
	const [on, setOn] = useState(true);
	const [chip, setChip] = useState(true);
	const [select, setSelect] = useState("1");
	const [open, setOpen] = useState(true);
	const setThemeAttr = (t: "dark" | "light") => {
		setTheme(t);
		document.documentElement.dataset.theme = t;
	};

	return (
		// The app's stylesheet keeps the window itself from scrolling
		<div className="h-screen overflow-y-auto">
			<div className="mx-auto flex max-w-5xl flex-col gap-10 p-8">
				<header className="flex items-center gap-4">
					<div className="flex-1">
						<h1 className="font-semibold text-2xl">ckdry design system</h1>
						<p className="text-muted-foreground text-sm">
							@ckdry/ui (packages/ckdry-ui) and the app's patterns. Use these; a hand-rolled control
							is a missing component.
						</p>
					</div>
					<SegmentedControl
						label="Theme"
						value={theme}
						onChange={setThemeAttr}
						options={[
							{ value: "dark", label: "Dark" },
							{ value: "light", label: "Light" },
						]}
					/>
				</header>

				<Section
					title="Colour tokens"
					note="Theme tokens only: no hex or palette colours (red-500) in classNames."
				>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
						{TOKENS.map(t => (
							<div key={t} className="flex items-center gap-2 rounded-lg border border-border p-2">
								<span
									className="size-6 shrink-0 rounded-md border border-border"
									style={{
										background: t.startsWith("exam-") ? `var(--color-${t})` : `var(--${t})`,
									}}
								/>
								<code className="truncate text-xs">{t}</code>
							</div>
						))}
					</div>
				</Section>

				<Section title="Type" note="Geist; tabular-nums for numbers that change.">
					<div className="flex flex-col gap-1">
						<span className="text-2xl">text-2xl · page title</span>
						<span className="text-lg">text-lg · section</span>
						<span className="text-base">text-base · body</span>
						<span className="text-sm">text-sm · default UI text</span>
						<span className="text-callout">text-callout · controls</span>
						<span className="text-xs">text-xs · secondary</span>
						<span className="text-caption text-muted-foreground">text-caption · captions</span>
						<code className="font-mono text-sm">font-mono · kubectl get pods -A</code>
					</div>
				</Section>

				<Section title="Button" note="Text actions. Icon-only actions use IconButton.">
					<Row>
						{(
							[
								"default",
								"pushDefault",
								"push",
								"outline",
								"ghost",
								"destructive",
								"outlineDestructive",
								"quiet",
							] as const
						).map(v => (
							<Button key={v} variant={v} size={v.startsWith("push") ? "push" : "sm"}>
								{v}
							</Button>
						))}
					</Row>
					<Row>
						<Button size="push">push · 28px</Button>
						<Button size="sm">sm · 32px</Button>
						<Button>default · 36px</Button>
						<Button size="pill" variant="solid">
							pill
						</Button>
						<Button size="sm" disabled>
							disabled
						</Button>
						<Button size="push" variant="push">
							<Spinner size="inline" /> Working…
						</Button>
						<Button variant="quiet" size="inline">
							inline
						</Button>
						<Button variant="quiet" size="picker">
							picker <ChevronDown />
						</Button>
					</Row>
				</Section>

				<Section title="IconButton" note="Its label is the tooltip (no native title).">
					<Row>
						<IconButton variant="plain" size="sm" aria-label="Settings">
							<Settings />
						</IconButton>
						<IconButton variant="plain" size="bar" aria-label="New">
							<Plus />
						</IconButton>
						<IconButton variant="glass" size="md" aria-label="Close">
							<X />
						</IconButton>
						<IconButton variant="plain" size="sm" active aria-label="Active">
							<Sparkles />
						</IconButton>
					</Row>
				</Section>

				<Section
					title="Truncated"
					note="One line cut short; hovering shows the whole text, or what a short label stands for."
				>
					<Row>
						<Truncated className="block w-48 text-callout">
							Allow only the frontend pods to reach the backend on port 8080
						</Truncated>
						<Truncated
							full="Default (recommended) · Opus"
							className="text-2xs text-muted-foreground"
						>
							Default (recommended)
						</Truncated>
					</Row>
				</Section>

				<Section
					title="Choosing"
					note="2–5 options: SegmentedControl. Exact values: Stepper. Longer lists: Select. On/off: Switch."
				>
					<Row>
						<SegmentedControl
							label="View"
							value={seg}
							onChange={setSeg}
							options={[
								{ value: "desktop", label: "Desktop" },
								{ value: "readme", label: "Readme" },
							]}
						/>
						<Stepper
							label="Size"
							value={`${step}%`}
							onDecrement={() => setStep(s => s - 25)}
							onIncrement={() => setStep(s => s + 25)}
							decrementDisabled={step <= 100}
						/>
						<Select value={select} onValueChange={setSelect}>
							<SelectTrigger aria-label="Question">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{["1", "2", "3"].map(n => (
									<SelectItem key={n} value={n}>
										Question {n} of 3
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Switch checked={on} onCheckedChange={setOn} aria-label="Switch" />
					</Row>
					<Row>
						<Input placeholder="Input" className="max-w-64" />
						<Textarea placeholder="Textarea (grows with its text)" className="max-w-64" />
						<div className="w-64 rounded-xl border border-border p-2">
							<Textarea variant="bare" rows={2} placeholder="bare: inside a composer's frame" />
						</div>
						<div className="w-48">
							<Range value={range} min={0} max={100} onValueChange={setRange} aria-label="Range" />
						</div>
					</Row>
				</Section>

				<Section
					title="Chip · Badge"
					note="Chip: a pill you can pick or remove. Badge: a small status label."
				>
					<Row>
						<Chip selected={chip} onClick={() => setChip(c => !c)}>
							Selectable
						</Chip>
						<Chip count={3}>With count</Chip>
						<Chip onRemove={() => toast("Removed")}>Removable</Chip>
						<Chip>Static</Chip>
					</Row>
					<Row>
						{(["subtle", "solid", "success", "destructive", "overlay"] as const).map(v => (
							<Badge key={v} variant={v}>
								{v}
							</Badge>
						))}
					</Row>
				</Section>

				<Section
					title="Card"
					note="Grouped surfaces. dashed: an empty slot, or something the app does not own."
				>
					<div className="grid grid-cols-3 gap-3">
						<Card padding="sm">padding sm</Card>
						<Card>padding md (default)</Card>
						<Card variant="dashed">dashed</Card>
					</div>
				</Section>

				<Section
					title="Alert"
					note="Inline messages; destructive interrupts a screen reader, the rest wait."
				>
					<div className="flex flex-col gap-2">
						<Alert>
							<Info /> info
						</Alert>
						<Alert variant="success">
							<Check /> success
						</Alert>
						<Alert variant="warning">
							<TriangleAlert /> warning
						</Alert>
						<Alert variant="destructive">
							<CircleAlert /> destructive
						</Alert>
					</div>
				</Section>

				<Section
					title="CodeBlock"
					note="Commands and manifests keep their lines (scroll); logs wrap."
				>
					<CodeBlock>
						kubectl run data-pod -n storage-task --image=nginx --dry-run=client -o yaml &gt;
						pod.yaml && kubectl apply -f pod.yaml
					</CodeBlock>
					<CodeBlock wrap className="max-h-24">
						{LONG_LOG}
					</CodeBlock>
					<CodeBlock
						title="bash"
						actions={
							<Button size="push" variant="ghost" className="h-6 px-2 text-xs">
								Copy
							</Button>
						}
					>
						kubectl get pvc -n storage-task
					</CodeBlock>
				</Section>

				<Section title="Table" note="Data in rows: a tinted header, hairlines between rows.">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Exam</TableHead>
								<TableHead>Score</TableHead>
								<TableHead>Result</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell>CKA Practice Exam 1</TableCell>
								<TableCell className="tabular-nums">72%</TableCell>
								<TableCell>
									<Badge variant="success">Pass</Badge>
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell>CKAD Practice Exam 1</TableCell>
								<TableCell className="tabular-nums">41%</TableCell>
								<TableCell>
									<Badge variant="destructive">Fail</Badge>
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</Section>

				<Section
					title="Progress · Disclosure"
					note="How far something is; a row that opens what is under it."
				>
					<div className="flex max-w-md flex-col gap-2">
						<Progress label="highlight" value={35} />
						<Progress label="success" value={80} tone="success" />
						<Progress label="warning" value={50} tone="warning" />
						<Progress label="destructive" value={20} tone="destructive" />
					</div>
					<Card padding="none" className="max-w-md overflow-hidden">
						<Disclosure
							open={open}
							onOpenChange={setOpen}
							summary={<span className="flex-1">Starting cluster k8s</span>}
						>
							<CodeBlock wrap>▸ Creating nodes{"\n"}▸ Waiting for the control plane</CodeBlock>
						</Disclosure>
					</Card>
				</Section>

				<Section title="Tabs" note="Sections of one page with a sidebar (Settings).">
					<div className="flex h-36 overflow-hidden rounded-lg border border-border">
						<Tabs defaultValue="a">
							<TabsList aria-label="Example">
								<TabsTrigger value="a">
									<Monitor /> Exam desk
								</TabsTrigger>
								<TabsTrigger value="b">
									<Sparkles /> AI
								</TabsTrigger>
							</TabsList>
							<TabsContent value="a" className="p-4 text-sm">
								The first section
							</TabsContent>
							<TabsContent value="b" className="p-4 text-sm">
								The second section
							</TabsContent>
						</Tabs>
					</div>
				</Section>

				<Section
					title="Feedback"
					note="Spinner, Loading (a line, or fill for a page or panel), Skeleton, toasts, Separator."
				>
					<Row>
						<Spinner size="inline" />
						<Spinner size="small" />
						<Skeleton className="h-6 w-40" />
						<Button size="push" variant="push" onClick={() => toast.success("Saved")}>
							Toast
						</Button>
						<Button size="push" variant="push" onClick={() => toast.error("Could not save")}>
							Error toast
						</Button>
					</Row>
					<Row>
						<Loading label="Loading exams…" />
						<div className="h-32 w-64 rounded-lg border border-border">
							<Loading fill label="Opening ckdry…" />
						</div>
					</Row>
					<Separator />
				</Section>

				<Section
					title="Overlays"
					note="Tooltip, Popover + menu rows, AlertDialog to confirm, Sheet for side panels."
				>
					<Row>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button size="push" variant="push">
									Tooltip
								</Button>
							</TooltipTrigger>
							<TooltipContent>The kit's tooltip</TooltipContent>
						</Tooltip>
						<Popover>
							<PopoverTrigger asChild>
								<Button size="push" variant="push">
									Menu
								</Button>
							</PopoverTrigger>
							<PopoverContent className={`${menu.surface} w-56`}>
								<div className={menu.header}>Section</div>
								<button type="button" className={menuRow()}>
									<span className={menu.check}>
										<Check className="size-3" />
									</span>
									Checked row
								</button>
								<button type="button" className={menuRow()}>
									Row <span className={menu.hint}>⌘K</span>
								</button>
								<button type="button" className={menuRow(menu.twoLine)}>
									<span className="flex min-w-0 flex-col">
										Two-line row
										<span className={menu.detail}>Its description</span>
									</span>
								</button>
								<div className={menu.separator} />
								<button type="button" className={menuRow()}>
									Another
								</button>
							</PopoverContent>
						</Popover>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									size="push"
									variant="outline"
									className="border-destructive/60 text-destructive"
								>
									Confirm
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>End the exam?</AlertDialogTitle>
									<AlertDialogDescription>Your work is graded now.</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Keep working</AlertDialogCancel>
									<AlertDialogAction>End exam</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
						<Sheet>
							<SheetTrigger asChild>
								<Button size="push" variant="push">
									Sheet
								</Button>
							</SheetTrigger>
							<SheetContent>
								<SheetHeader>
									<SheetTitle>A side panel</SheetTitle>
									<SheetDescription>For review panes and details.</SheetDescription>
								</SheetHeader>
							</SheetContent>
						</Sheet>
					</Row>
				</Section>

				<Section title="Scrolling" note="One thin themed scrollbar everywhere (globals.css).">
					<div className="h-28 overflow-auto rounded-lg border border-border p-3 text-sm">
						{Array.from({ length: 12 }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static list
							<p key={i} className="whitespace-nowrap">
								Line {i + 1}: a long line that also scrolls sideways to show the horizontal
								scrollbar, as a log would without wrapping
							</p>
						))}
					</div>
				</Section>

				<Section title="App patterns" note="ckdry's own components, built on the kit.">
					<Row>
						<Timer startedAt={Date.now() - 60_000} endsAt={Date.now() + 7_200_000} />
						<Timer startedAt={Date.now() - 60_000} endsAt={Date.now() + 1_200_000} />
						<Timer startedAt={Date.now() - 60_000} endsAt={Date.now() + 240_000} />
						<span className="flex items-center gap-2 text-sm">
							<StatusDot tone="ok" /> ok <StatusDot tone="warn" /> warn <StatusDot tone="error" />{" "}
							error <StatusDot tone="idle" /> idle
						</span>
						<span className="flex items-center gap-2 text-sm">
							<ActivityStatusIcon status="running" /> <ActivityStatusIcon status="done" />{" "}
							<ActivityStatusIcon status="failed" />
						</span>
					</Row>
					<Row>
						<span className="text-sm">Click to copy:</span>
						<CopyText
							className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-exam-value"
							text="ssh k8s"
						/>
					</Row>
					<CopyBlock
						text={"kubectl -n team-a get pods\nkubectl -n team-a describe pod web"}
						lang="shell"
					/>
					<CheckList
						checks={[
							{
								name: "PVC data-pvc is Bound",
								weight: 2,
								passed: false,
								detail: "phase is Pending",
							},
							{ name: "Namespace exists", weight: 1, passed: true, detail: "" },
						]}
						onWhy={() => toast("Why?")}
					/>
					<Card padding="sm">
						<Answer>
							{
								"**Assistant answer.** `storageClassName` can't change on a PVC:\n\n```bash\nkubectl delete pvc data-pvc -n storage-task\n```\n\nDocs: [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)"
							}
						</Answer>
					</Card>
					<Alert variant="warning">
						<Lightbulb />
						<p>
							<strong>Hint 1.</strong> A hint, as the question panel shows it.
						</p>
					</Alert>
				</Section>
				<Toaster />
			</div>
		</div>
	);
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-semibold text-lg">{title}</h2>
				<p className="text-muted-foreground text-sm">{note}</p>
			</div>
			{children}
		</section>
	);
}

const Row = ({ children }: { children: ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
);

createRoot(document.getElementById("root") as HTMLElement).render(<Gallery />);
