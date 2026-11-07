// The design system, live: every kit component and the app's own patterns,
// in both themes. Development only (`pnpm vite` → /kit.html); the app build
// does not include it. When a component or variant is added, add it here.
import { Alert } from "@cktry/ui/components/alert";
import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { Capsule, CapsuleItem } from "@cktry/ui/components/capsule";
import { Card, CardDescription, CardHeader, CardTitle } from "@cktry/ui/components/card";
import { Chip } from "@cktry/ui/components/chip";
import { CodeBlock } from "@cktry/ui/components/code-block";
import { ConfirmDialog } from "@cktry/ui/components/confirm-dialog";
import { Disclosure } from "@cktry/ui/components/disclosure";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@cktry/ui/components/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@cktry/ui/components/hover-card";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Input } from "@cktry/ui/components/input";
import { Loading } from "@cktry/ui/components/loading";
import { menu, menuRow } from "@cktry/ui/components/menu";
import { Placeholder, SampleRows } from "@cktry/ui/components/placeholder";
import { Popover, PopoverContent, PopoverTrigger } from "@cktry/ui/components/popover";
import { Progress, ProgressRing } from "@cktry/ui/components/progress";
import { Range } from "@cktry/ui/components/range";
import { SectionTitle } from "@cktry/ui/components/section-title";
import { SegmentedControl } from "@cktry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@cktry/ui/components/select";
import { Separator } from "@cktry/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@cktry/ui/components/sheet";
import {
	Sidebar,
	SidebarEye,
	SidebarGrip,
	SidebarItem,
	SidebarLabel,
	SidebarRemove,
} from "@cktry/ui/components/sidebar";
import { Skeleton } from "@cktry/ui/components/skeleton";
import { Toaster } from "@cktry/ui/components/sonner";
import { Spinner } from "@cktry/ui/components/spinner";
import { Stat, StatGroup } from "@cktry/ui/components/stat";
import { StatusDot } from "@cktry/ui/components/status-dot";
import { Stepper } from "@cktry/ui/components/stepper";
import { Switch } from "@cktry/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cktry/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cktry/ui/components/tabs";
import { Terminal } from "@cktry/ui/components/terminal";
import { Textarea } from "@cktry/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@cktry/ui/components/tooltip";
import { Truncated } from "@cktry/ui/components/truncated";
import {
	Check,
	ChevronDown,
	CircleAlert,
	History,
	Info,
	LayoutList,
	Lightbulb,
	Monitor,
	PanelLeft,
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
import { Answer } from "@/components/assistant/answer";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { CheckList } from "@/components/exam/check-list";
import { Timer } from "@/components/exam/timer";
import { CopyBlock, CopyText } from "@/components/text/copy-text";
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
						<h1 className="font-semibold text-2xl">cktry design system</h1>
						<p className="text-muted-foreground text-sm">
							@cktry/ui (packages/cktry-ui) and the app's patterns. Use these; a hand-rolled control
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
						<span className="font-bold text-title">text-title · a screen's title</span>
						<SectionTitle>SectionTitle · a section</SectionTitle>
						<SectionTitle size="group">SectionTitle group · over a group of rows</SectionTitle>
						<span className="text-base">text-base · body</span>
						<span className="text-sm">text-sm · default UI text</span>
						<span className="text-callout">text-callout · controls</span>
						<span className="text-xs">text-xs · secondary</span>
						<span className="text-caption text-muted-foreground">text-caption · captions</span>
						<code className="font-mono text-sm">font-mono · kubectl get pods -A</code>
					</div>
				</Section>

				<Section
					title="Button"
					note="Text actions: pushDefault for an area's main action (one), push for the others, quiet for small ones. Icon-only actions use IconButton."
				>
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
					title="DropdownMenu"
					note="A menu from a button: choices with a short second line, a submenu for a setting of the choice."
				>
					<Row>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="push" variant="push">
									Opus 5.5 <span className="opacity-60">Medium</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-72">
								<DropdownMenuRadioGroup value="opus">
									<DropdownMenuRadioItem value="opus" detail="For complex work and everyday tasks">
										Opus 5.5
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="haiku" detail="Fastest for quick answers">
										Haiku 5.5
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
								<DropdownMenuSeparator />
								<DropdownMenuSub>
									<DropdownMenuSubTrigger value="Medium">Effort</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										<DropdownMenuRadioGroup value="medium">
											<DropdownMenuRadioItem value="medium">
												Medium <Badge variant="tag">Recommended</Badge>
											</DropdownMenuRadioItem>
											<DropdownMenuRadioItem value="max">
												Max <Badge variant="warningTag">More usage</Badge>
											</DropdownMenuRadioItem>
										</DropdownMenuRadioGroup>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							</DropdownMenuContent>
						</DropdownMenu>
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
						{(["subtle", "accent", "solid", "success", "destructive", "overlay"] as const).map(
							v => (
								<Badge key={v} variant={v}>
									{v}
								</Badge>
							)
						)}
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
					<Card padding="lg" className="max-w-md">
						<CardHeader>
							<CardTitle>Readiness</CardTitle>
							<CardDescription>2 of 5 domains measured</CardDescription>
						</CardHeader>
						A header: its title, and what it is about at the end of the line.
					</Card>
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
						<Alert variant="warning" size="sm">
							size sm · in a narrow pane or under a control
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
						<Progress label="with a pass line" value={58} tone="warning" marker={66} />
					</div>
					<div className="flex gap-3">
						<ProgressRing value={50} label="1 of 2 done">
							1/2
						</ProgressRing>
						<ProgressRing value={100} label="all done">
							3/3
						</ProgressRing>
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

				<Section
					title="Sidebar and Capsule"
					note="The window's sidebar over its translucent material, and the floating capsule it folds into."
				>
					<Row>
						<Sidebar className="m-0 h-72">
							<div className="px-2 py-2">
								<SidebarItem icon={<LayoutList />} label="Exams" current />
								<SidebarItem icon={<History />} label="History" />
								<SidebarLabel>CKA</SidebarLabel>
								<SidebarItem label="Core Concepts" detail="10 questions, 60 min" current />
								<SidebarItem
									label="Advanced Administration"
									detail="20 questions, 120 min, runs slower"
									warning
								/>
							</div>
						</Sidebar>
						{/* The same, while it is edited */}
						<Sidebar className="m-0 h-72">
							<div className="px-2 py-2">
								<SidebarItem icon={<LayoutList />} label="Exams" trailing={<SidebarGrip />} />
								<SidebarItem
									icon={<History />}
									label="History"
									className="opacity-40"
									trailing={
										<>
											<SidebarEye hidden name="History" onToggle={() => {}} />
											<SidebarGrip />
										</>
									}
								/>
								<SidebarItem
									label="My questions"
									detail="3 questions, 120 min"
									leading={<SidebarRemove name="My questions" onRemove={() => {}} />}
									trailing={<SidebarGrip />}
								/>
							</div>
						</Sidebar>
						<Capsule aria-label="Screens">
							<IconButton
								variant="plain"
								size="bar"
								className="rounded-full"
								aria-label="Show sidebar"
							>
								<PanelLeft />
							</IconButton>
							<CapsuleItem current>
								Exams
								<ChevronDown />
							</CapsuleItem>
							<CapsuleItem>History</CapsuleItem>
							<CapsuleItem>Settings</CapsuleItem>
						</Capsule>
					</Row>
				</Section>

				<Section
					title="HoverCard"
					note="More about what the pointer rests on, in a card it can go onto: opens after a rest, scrolls and selects."
				>
					<HoverCard openDelay={300}>
						<HoverCardTrigger asChild>
							<span className="w-fit cursor-default rounded-md bg-muted px-2 py-1 text-callout">
								Rest on this day
							</span>
						</HoverCardTrigger>
						<HoverCardContent>
							<Terminal className="w-72 shadow-[var(--shadow-float)]">
								<Terminal.Command>kubectl describe day 2026-11-02</Terminal.Command>
								{"\nAttempts:  <none>\nPlans:     <none>"}
							</Terminal>
						</HoverCardContent>
					</HoverCard>
				</Section>

				<Section
					title="Placeholder"
					note="What a surface will show, faded, while it has nothing yet: a line and an action over it."
				>
					<Card padding="lg">
						<Placeholder
							sample={
								<StatGroup>
									<Stat value={12} label="days studied" />
									<Stat value="78%" label="best" />
								</StatGroup>
							}
							title="Your study days show here"
							description="Each day tinted by its best score"
							action={
								<Button size="push" variant="push">
									Plan the week
								</Button>
							}
						/>
					</Card>
					<Placeholder
						sample={<SampleRows rows={3} />}
						title="No attempts yet"
						description="SampleRows: the sample for a list or a table"
					/>
				</Section>

				<Section
					title="Stat"
					note="Figures side by side on one card, an icon above each when it helps."
				>
					<StatGroup>
						<Stat icon={<Monitor />} value={10} label="questions" />
						<Stat icon={<Info />} value="60 min" label="time" />
						<Stat value="66%" label="to pass" />
					</StatGroup>
				</Section>

				<Section
					title="Terminal"
					note="Text as a terminal shows it, in the theme, tones for its parts; sm for a log under a row."
				>
					<Terminal>
						<Terminal.Command>kubectl get exam cka</Terminal.Command>
						{"\nNAME   DATE        PREDICTED  STATUS\ncka    2026-12-15  "}
						<Terminal.Ok>71%</Terminal.Ok>
						{"        "}
						<Terminal.Ok>OnTrack</Terminal.Ok>
						{"\n"}
						<Terminal.Warn>Warning</Terminal.Warn>
						{"  BelowPass  storage 58%"}
					</Terminal>
					<Terminal size="sm">
						{"Creating cluster k8s-v7f3a\nWaiting for the nodes… ready in 31 s"}
					</Terminal>
					<PromptSample />
				</Section>

				<Section title="Tabs" note="Sections of one page with a sidebar.">
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
						<Button
							size="push"
							variant="push"
							onClick={() =>
								toast.success("Exam saved", { action: { label: "Open", onClick: () => {} } })
							}
						>
							Success toast
						</Button>
						<Button
							size="push"
							variant="push"
							onClick={() =>
								toast.success(
									"Deleted CKA Mock – Weak Domains (Troubleshooting, Networking and Storage)",
									{
										description: "and 2 exams using its questions",
									}
								)
							}
						>
							Long toast
						</Button>
						<Button
							size="push"
							variant="push"
							onClick={() =>
								toast.error("Docker is not running", {
									action: { label: "Retry", onClick: () => {} },
								})
							}
						>
							Error toast
						</Button>
						<Button
							size="push"
							variant="push"
							onClick={() => toast("Proof stopped: its cluster is removed")}
						>
							Toast
						</Button>
					</Row>
					<Row>
						<Loading label="Loading exams…" />
						<div className="h-32 w-64 rounded-lg border border-border">
							<Loading fill label="Opening cktry…" />
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
						<ConfirmDialog
							title="End the exam?"
							description="Your work is graded now."
							action="End Exam"
							onConfirm={() => {}}
						>
							<Button size="push" variant="outlineDestructive">
								Confirm
							</Button>
						</ConfirmDialog>
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

				<Section title="App patterns" note="cktry's own components, built on the kit.">
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
						<span className="flex items-center gap-3 text-assistant">
							<AssistantIcon className="size-3.5" />
							<AssistantIcon className="size-4" />
							<AssistantIcon className="size-6" />
							<AssistantIcon className="size-8" />
						</span>
						<span className="text-muted-foreground text-sm">
							AssistantIcon: the assistant, whichever agent answers
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

/** A prompt with a command typed already and its suggestion */
function PromptSample() {
	const [line, setLine] = useState("kubectl set exam ");
	const [ran, setRan] = useState("");
	return (
		<Terminal className="flex flex-col">
			{ran && <Terminal.Muted>{`$ ${ran}\n`}</Terminal.Muted>}
			<Terminal.Prompt
				label="Command"
				value={line}
				onChange={setLine}
				onSubmit={value => {
					setRan(value);
					setLine("kubectl set exam ");
				}}
				initial="kubectl set exam "
				suggestion="kubectl set exam cka --date 2026-12-15"
				comment="Tab fills it in, Enter sets it"
			/>
		</Terminal>
	);
}
