import { Toaster } from "@ckdry/ui/components/sonner";
import { cn } from "@ckdry/ui/lib/utils";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { CatalogRoute } from "@/routes/catalog";
import { EnvironmentRoute } from "@/routes/environment";
import { ExamRoute } from "@/routes/exam";
import { HistoryRoute } from "@/routes/history";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import "./index.css";

const NAV = [
	{ to: "/", label: "Exams" },
	{ to: "/history", label: "History" },
	{ to: "/environment", label: "Environment" },
];

function Layout() {
	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-4 border-border border-b px-4 py-2">
				<strong>ckdry</strong>
				<nav className="flex gap-1">
					{NAV.map(item => (
						<NavLink
							key={item.to}
							to={item.to}
							end
							className={({ isActive }) =>
								cn(
									"rounded-md px-2.5 py-1 text-sm hover:bg-accent",
									isActive && "bg-accent font-medium"
								)
							}
						>
							{item.label}
						</NavLink>
					))}
				</nav>
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
	// Follow the Rust environment and exam state for the life of the app
	useEffect(() => {
		const stops = [connectEnv(), connectExam()];
		return () => {
			for (const stop of stops) stop.then(fn => fn());
		};
	}, [connectEnv, connectExam]);

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
