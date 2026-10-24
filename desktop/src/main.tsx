import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Toaster } from "@ckdry/ui/components/sonner";
import { StrictMode, useEffect } from "react";
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
import { useActivities } from "@/stores/activity";
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
	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-4 border-border border-b px-4 py-2">
				<strong>ckdry</strong>
				<nav>
					<SegmentedControl label="Sections" options={NAV} value={pathname} onChange={navigate} />
				</nav>
				<ActivityChip />
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
	// Follow the Rust environment, exam state and long operations for the
	// life of the app
	useEffect(() => {
		loadSettings();
		const stops = [connectEnv(), connectExam(), connectActivities()];
		return () => {
			for (const stop of stops) stop.then(fn => fn());
		};
	}, [connectEnv, connectExam, connectActivities, loadSettings]);

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
					</Route>
				</Routes>
			</HashRouter>
			<Toaster />
		</>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
