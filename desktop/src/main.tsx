import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Loading } from "@ckdry/ui/components/loading";
import { Toaster } from "@ckdry/ui/components/sonner";
import { CircleAlert } from "lucide-react";
import { lazy, type ReactNode, StrictMode, Suspense, useEffect, useState } from "react";
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
	// An attempt in progress: ExamGuard moves to it; nothing flashes meanwhile
	const busy = useExam(s => s.state !== null && s.state.phase !== "idle");
	const folded = useSettings(s => s.settings.sidebar_folded);
	const update = useSettings(s => s.update);
	const [searching, setSearching] = useState(false);
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
		<div className="flex h-full">
			{!folded && (
				<AppSidebar
					searching={searching}
					onSearching={setSearching}
					onFold={() => update({ sidebar_folded: true })}
				/>
			)}
			<div className="flex min-w-0 flex-1 flex-col bg-background">
				<TitleBar
					folded={folded}
					onUnfold={() => update({ sidebar_folded: false })}
					onSearch={() => {
						setSearching(true);
						update({ sidebar_folded: false });
					}}
				/>
				<main className="min-h-0 flex-1 overflow-auto">
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
const EnvironmentRoute = screen(() => import("@/routes/environment"), "EnvironmentRoute");
const SettingsRoute = screen(() => import("@/routes/settings"), "SettingsRoute");

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
