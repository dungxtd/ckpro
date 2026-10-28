import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Loading } from "@ckdry/ui/components/loading";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Toaster } from "@ckdry/ui/components/sonner";
import { CircleAlert, Settings } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
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
import { ActivityChip } from "@/components/activity/activity-chip";
import { CatalogRoute } from "@/routes/catalog";
import { EnvironmentRoute } from "@/routes/environment";
import { ExamRoute } from "@/routes/exam";
import { HistoryRoute } from "@/routes/history";
import { SettingsRoute } from "@/routes/settings";
import { useActivities } from "@/stores/activity";
import { useCoach } from "@/stores/coach";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import "./index.css";

const NAV = [
	{ value: "/", label: "Exams" },
	{ value: "/history", label: "History" },
	{ value: "/environment", label: "Environment" },
];

function Layout() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	// An attempt in progress: ExamGuard moves to it; nothing flashes meanwhile
	const busy = useExam(s => s.state !== null && s.state.phase !== "idle");
	// ⌘, opens Settings, as in every Mac app
	useEffect(() => {
		const open = (e: KeyboardEvent) => {
			if (e.metaKey && e.key === ",") {
				e.preventDefault();
				navigate("/settings");
			}
		};
		window.addEventListener("keydown", open);
		return () => window.removeEventListener("keydown", open);
	}, [navigate]);
	if (busy) return null;
	return (
		<div className="flex h-full flex-col">
			<header className="flex select-none items-center gap-4 border-border border-b px-4 py-2">
				<strong>ckdry</strong>
				<nav>
					<SegmentedControl label="Sections" options={NAV} value={pathname} onChange={navigate} />
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ActivityChip />
					<IconButton
						variant="plain"
						size="sm"
						className="size-7"
						active={pathname === "/settings"}
						aria-label="Settings (⌘,)"
						onClick={() => navigate("/settings")}
					>
						<Settings />
					</IconButton>
				</div>
			</header>
			<main className="min-h-0 flex-1 overflow-auto">
				<Outlet />
			</main>
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
	const examKnown = useExam(s => s.state !== null);
	const settingsError = useSettings(s => s.error);
	const examError = useExam(s => s.connectError);
	const failed = settingsError ?? examError;
	if (failed) return <OpenFailed message={failed} onRetry={() => setBoot(b => b + 1)} />;
	if (!settingsLoaded || !examKnown) return <Loading fill label="Opening ckdry…" />;

	return (
		<>
			<HashRouter>
				<ExamGuard />
				<Routes>
					<Route path="/exam" element={<ExamRoute />} />
					<Route element={<Layout />}>
						<Route path="/" element={<CatalogRoute />} />
						<Route path="/history" element={<HistoryRoute />} />
						<Route path="/environment" element={<EnvironmentRoute />} />
						<Route path="/settings" element={<SettingsRoute />} />
					</Route>
				</Routes>
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

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
