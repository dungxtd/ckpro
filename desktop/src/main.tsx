import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Loading } from "@ckdry/ui/components/loading";
import { Toaster } from "@ckdry/ui/components/sonner";
import { cn } from "@ckdry/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import { lazy, type ReactNode, StrictMode, Suspense, useEffect, useRef, useState } from "react";
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
import { AppSidebar } from "@/components/shell/app-sidebar";
import { screenTitle } from "@/components/shell/sections";
import { TitleBar } from "@/components/shell/title-bar";
import { WindowFrame } from "@/components/shell/window";
import { CatalogRoute } from "@/routes/catalog";
import { useActivities } from "@/stores/activity";
import { useCoach } from "@/stores/coach";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { appApi, errorText } from "@/tauri/api";
import "./index.css";

function Layout() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	// An attempt in progress: ExamGuard moves to it; nothing flashes meanwhile
	const busy = useExam(s => s.state !== null && s.state.phase !== "idle");
	const folded = useSettings(s => s.settings.sidebar_folded);
	const update = useSettings(s => s.update);
	const [searching, setSearching] = useState(false);
	// The screen's own title scrolled away: the title bar shows it small
	const [scrolled, setScrolled] = useState(false);
	const main = useRef<HTMLElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: each screen opens at its top
	useEffect(() => {
		main.current?.scrollTo({ top: 0 });
		setScrolled(false);
	}, [pathname]);
	// ⌘, opens Settings and ⌃⌘S shows or hides the sidebar, as in every Mac app
	useEffect(() => {
		const keys = (e: KeyboardEvent) => {
			if (e.metaKey && e.key === ",") {
				e.preventDefault();
				navigate("/settings");
			} else if (e.metaKey && e.ctrlKey && e.key.toLowerCase() === "s") {
				e.preventDefault();
				update({ sidebar_folded: !useSettings.getState().settings.sidebar_folded });
			}
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	}, [navigate, update]);
	if (busy) return null;
	return (
		// The sidebar slides away and the content widens into its place; the
		// capsule comes in as it goes
		<div
			className={cn(
				"grid h-full transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
				folded ? "grid-cols-[0px_minmax(0,1fr)]" : "grid-cols-[256px_minmax(0,1fr)]"
			)}
		>
			<div className="min-w-0 overflow-hidden">
				<AppSidebar
					folded={folded}
					searching={searching}
					onSearching={setSearching}
					onFold={() => update({ sidebar_folded: true })}
				/>
			</div>
			<div className="flex min-w-0 flex-col">
				<TitleBar
					folded={folded}
					title={scrolled ? screenTitle(pathname) : undefined}
					onUnfold={() => update({ sidebar_folded: false })}
					onSearch={() => {
						setSearching(true);
						update({ sidebar_folded: false });
					}}
				/>
				<main
					ref={main}
					className="min-h-0 flex-1 overflow-auto"
					onScroll={e => setScrolled(e.currentTarget.scrollTop > 48)}
				>
					<Outlet />
				</main>
			</div>
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
	const loadSettings = useSettings(s => s.load);
	// Bumped by Try Again: everything is read and followed afresh
	const [boot, setBoot] = useState(0);
	// Follow the Rust environment, exam state and long operations for the
	// life of the app
	useEffect(() => {
		void boot;
		loadSettings();
		const stops = [connectEnv(), connectExam(), connectActivities()];
		return () => {
			for (const stop of stops)
				stop.then(
					fn => fn(),
					() => {}
				);
		};
	}, [connectEnv, connectExam, connectActivities, loadSettings, boot]);
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
				<Loading fill label="Opening ckdry…" />
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
							<Route path="/" element={<CatalogRoute />} />
							<Route path="/history" element={<HistoryRoute />} />
							<Route path="/calendar" element={<CalendarRoute />} />
							<Route path="/environment" element={<EnvironmentRoute />} />
							<Route path="/settings" element={<SettingsRoute />} />
						</Route>
					</Routes>
				</Suspense>
			</HashRouter>
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
						<strong>ckdry could not open</strong>
						<p className="mt-1 break-words text-muted-foreground">{message}</p>
					</div>
					<Button size="push" variant="push" className="self-end" onClick={onRetry}>
						Try Again
					</Button>
				</div>
			</Alert>
		</div>
	);
}

// A failure nothing handled still says what went wrong, instead of an
// action that silently did nothing
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
const CalendarRoute = screen(() => import("@/routes/calendar"), "CalendarRoute");
const EnvironmentRoute = screen(() => import("@/routes/environment"), "EnvironmentRoute");
const SettingsRoute = screen(() => import("@/routes/settings"), "SettingsRoute");

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
