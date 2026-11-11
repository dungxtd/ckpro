import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { Toaster } from "@ckpro/ui/components/sonner";
import { useElementSize } from "@ckpro/ui/hooks/use-element-size";
import { mac } from "@ckpro/ui/lib/platform";
import { cn } from "@ckpro/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	type ReactNode,
	StrictMode,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
	HashRouter,
	Navigate,
	Outlet,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router";
import { toast } from "sonner";
import { pageView, setAnalytics, track } from "@/analytics";
import { StartPrompt } from "@/components/exam/start-prompt";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CAPSULE_GAP } from "@/components/shell/capsule-nav";
import {
	INSPECTOR_FROM_PX,
	InspectorProvider,
	useInspectorSlot,
} from "@/components/shell/inspector";
import { TitleBar } from "@/components/shell/title-bar";
import { WindowFrame } from "@/components/shell/window";
import { CatalogRoute } from "@/routes/catalog";
import { SHORTCUTS } from "@/shortcuts";
import { useActivities } from "@/stores/activity";
import { useCoach } from "@/stores/coach";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { appApi, errorText } from "@/tauri/api";
import { useTheme } from "@/theme";
import "./index.css";

function Layout() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	// An attempt in progress: ExamGuard moves to it; nothing flashes meanwhile
	const busy = useExam(s => s.state !== null && s.state.phase !== "idle");
	const folded = useSettings(s => s.settings.sidebar_folded);
	const update = useSettings(s => s.update);
	const [searching, setSearching] = useState(false);
	const main = useRef<HTMLElement>(null);
	// The capsule's width and what ends the title bar: the folded surface's box
	// follows from them in CSS (index.css), so the fold reads nothing as it moves
	const [capsule, { width: capsuleWidth }] = useElementSize<HTMLElement>({ border: true });
	const [barEnd, setBarEnd] = useState(0);
	// Folding or unfolding: the surface and the columns move only then, so a
	// window being resized is followed at once rather than chased
	const [fold, setFold] = useState({ folded, moving: false });
	if (fold.folded !== folded) setFold({ folded, moving: true });
	// biome-ignore lint/correctness/useExhaustiveDependencies: each screen opens at its top
	useEffect(() => {
		main.current?.scrollTo({ top: 0 });
	}, [pathname]);
	// ⌘, (Ctrl+,) opens Settings and ⌃⌘S (Ctrl+Shift+S) shows or hides the sidebar
	useEffect(() => {
		const keys = (e: KeyboardEvent) => {
			if (SHORTCUTS.settings.is(e)) {
				e.preventDefault();
				navigate("/settings");
			} else if (SHORTCUTS.sidebar.is(e)) {
				e.preventDefault();
				update({ sidebar_folded: !useSettings.getState().settings.sidebar_folded });
			}
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	}, [navigate, update]);
	// An inspector when the content and it have room together
	const [area, { width }] = useElementSize<HTMLDivElement>();
	const inspector = useInspectorSlot(width >= INSPECTOR_FROM_PX);
	if (busy) return null;
	return (
		// The sidebar slides away and the content widens into its place; the
		// capsule comes in as it goes
		<div
			// What the shell's CSS follows: folded, an inspector, and the capsule's
			// width and right-hand clearance
			data-folded={folded || undefined}
			data-moving={fold.moving || undefined}
			data-inspecting={inspector.slot.shown || undefined}
			style={
				{
					"--capsule-w": `${capsuleWidth}px`,
					"--capsule-right": `calc(var(--inspector-space, 0px) + ${barEnd + CAPSULE_GAP}px)`,
				} as CSSProperties
			}
			className={cn(
				"group/shell relative",
				// One row the window's height: the screen scrolls inside it. The
				// columns move with the surface, on its curve
				"shell-fold grid h-full grid-rows-[minmax(0,1fr)] transition-[grid-template-columns]",
				folded ? "grid-cols-[0px_minmax(0,1fr)]" : "grid-cols-[256px_minmax(0,1fr)]"
			)}
		>
			{/* The sidebar's panel and the capsule's pill are this one surface: CSS
			    moves it from the one box to the other (index.css, .shell-surface);
			    the sidebar's rows and the capsule's items fade over it */}
			{/* Drawn once the capsule's width is known: a window opened folded
			    starts with the pill in place, not growing into it */}
			{capsuleWidth > 0 && (
				<div
					aria-hidden
					className="shell-surface"
					onTransitionEnd={e => {
						if (e.target === e.currentTarget && e.propertyName === "height")
							setFold(f => ({ ...f, moving: false }));
					}}
				/>
			)}
			<div className="min-w-0 overflow-hidden">
				<AppSidebar
					folded={folded}
					searching={searching}
					onSearching={setSearching}
					onFold={() => update({ sidebar_folded: true })}
				/>
			</div>
			{/* The content, and beside it a screen's inspector (as tall as the window) */}
			<InspectorProvider value={inspector.slot}>
				<div ref={area} className="flex min-h-0 min-w-0">
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						<TitleBar
							capsuleRef={capsule}
							onEndWidth={setBarEnd}
							folded={folded}
							onUnfold={() => update({ sidebar_folded: false })}
							onSearch={() => {
								setSearching(true);
								update({ sidebar_folded: false });
							}}
						/>
						<main
							ref={main}
							// Room kept for the scrollbar: a screen that grows past the window does not shift
							className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
						>
							{/* Each screen opens at once: a screen changed often is not
							    kept waiting by a fade */}
							<div key={pathname} className="h-full">
								<Outlet />
							</div>
						</main>
					</div>
					<div ref={inspector.ref} className="flex h-full shrink-0" />
				</div>
			</InspectorProvider>
		</div>
	);
}

/** An attempt in progress owns the window until it is closed. */
function ExamGuard() {
	const phase = useExam(s => s.state?.phase);
	const { pathname } = useLocation();
	if (phase && phase !== "idle" && pathname !== "/exam") return <Navigate to="/exam" replace />;
	return null;
}

function App() {
	const connectEnv = useEnvironment(s => s.connect);
	const connectExam = useExam(s => s.connect);
	const connectActivities = useActivities(s => s.connect);
	const connectStudy = useStudy(s => s.connect);
	useTheme();
	const loadSettings = useSettings(s => s.load);
	// Bumped by Try again: everything is read and followed afresh
	const [boot, setBoot] = useState(0);
	// Follow the Rust environment, exam state and long operations for the
	// life of the app
	useEffect(() => {
		void boot;
		loadSettings();
		const stops = [connectEnv(), connectExam(), connectActivities(), connectStudy()];
		return () => {
			for (const stop of stops)
				stop.then(
					fn => fn(),
					() => {}
				);
		};
	}, [connectEnv, connectExam, connectActivities, connectStudy, loadSettings, boot]);
	// Opened straight on the right screen: the settings and where the exam is
	// are known before anything shows (no catalog flashing before a resume)
	const settingsLoaded = useSettings(s => s.loaded);
	// The assistant's state, read once in the background as the app opens
	const assistantOn = useSettings(s => s.loaded && s.settings.assistant_enabled);
	useEffect(() => {
		if (assistantOn) useCoach.getState().warm();
	}, [assistantOn]);
	// Usage analytics, as Settings > About say (on unless turned off)
	const analyticsOn = useSettings(s => (s.loaded ? s.settings.analytics : null));
	useEffect(() => {
		if (analyticsOn === null) return;
		appApi.info().then(info => {
			setAnalytics(analyticsOn, { app_version: info.version });
			if (analyticsOn) track("app_opened");
		});
	}, [analyticsOn]);
	const examKnown = useExam(s => s.state !== null);
	const settingsError = useSettings(s => s.error);
	const examError = useExam(s => s.connectError);
	const failed = settingsError ?? examError;
	if (failed)
		return (
			<WindowFrame>
				<OpenFailed message={failed} onRetry={() => setBoot(b => b + 1)} />
			</WindowFrame>
		);
	if (!settingsLoaded || !examKnown)
		return (
			<WindowFrame>
				<Loading fill label="Opening ckpro…" />
			</WindowFrame>
		);

	return (
		<>
			<HashRouter>
				<PageViews />
				<ExamGuard />
				{/* The catalog comes with the app; the other screens load when first
				    opened (the exam desk is the heaviest: the remote desktop, Markdown) */}
				<Suspense fallback={<Loading fill />}>
					<Routes>
						<Route path="/exam" element={<ExamRoute />} />
						<Route element={<Layout />}>
							<Route path="/" element={<HomeRoute />} />
							<Route path="/exams" element={<CatalogRoute />} />
							<Route path="/history" element={<HistoryRoute />} />
							<Route path="/calendar" element={<CalendarRoute />} />
							<Route path="/create" element={<CreateRoute />} />
							<Route path="/environment" element={<EnvironmentRoute />} />
							<Route path="/settings" element={<SettingsRoute />} />
							<Route path="/settings/:part" element={<SettingsRoute />} />
						</Route>
					</Routes>
				</Suspense>
			</HashRouter>
			{/* Starting an exam whose clusters exist asks first, from any screen */}
			<StartPrompt />
			<Toaster />
		</>
	);
}

/** The app could not read its settings or the exam's state: nothing opens
 * on a guess; it says why and tries again when asked */
function OpenFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Alert variant="destructive" className="w-full max-w-md">
				<CircleAlert />
				<div className="flex min-w-0 flex-1 flex-col gap-3">
					<div>
						<strong>ckpro could not open</strong>
						<p className="mt-1 break-words text-muted-foreground">{message}</p>
					</div>
					<Button size="push" variant="push" className="self-end" onClick={onRetry}>
						Try again
					</Button>
				</div>
			</Alert>
		</div>
	);
}

// A failure nothing handled still says what went wrong, instead of an
// action that silently did nothing
// Which platform the window is on, for the little CSS that differs (index.css)
document.documentElement.dataset.platform = mac ? "mac" : "windows";

window.addEventListener("unhandledrejection", e => {
	toast.error(errorText(e.reason));
});

/** Each screen shown, for analytics */
function PageViews() {
	const { pathname } = useLocation();
	useEffect(() => pageView(pathname), [pathname]);
	return null;
}

/** A route's screen, loaded when it is first shown */
function screen<T extends string>(load: () => Promise<Record<T, () => ReactNode>>, name: T) {
	return lazy(() => load().then(m => ({ default: m[name] })));
}
const ExamRoute = screen(() => import("@/routes/exam"), "ExamRoute");
const HistoryRoute = screen(() => import("@/routes/history"), "HistoryRoute");
const CreateRoute = screen(() => import("@/routes/create"), "CreateRoute");
const HomeRoute = screen(() => import("@/routes/home"), "HomeRoute");
const CalendarRoute = screen(() => import("@/routes/calendar"), "CalendarRoute");
const EnvironmentRoute = screen(() => import("@/routes/environment"), "EnvironmentRoute");
const SettingsRoute = screen(() => import("@/routes/settings"), "SettingsRoute");

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
