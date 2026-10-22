import { Toaster } from "@ckdry/ui/components/sonner";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import { EnvironmentRoute } from "@/routes/environment";
import { useEnvironment } from "@/stores/environment";
import "./index.css";

function App() {
	const connect = useEnvironment(s => s.connect);
	// Follow the Rust environment state for the life of the app
	useEffect(() => {
		const unsubscribe = connect();
		return () => {
			unsubscribe.then(stop => stop());
		};
	}, [connect]);

	return (
		<>
			<HashRouter>
				<Routes>
					<Route path="*" element={<EnvironmentRoute />} />
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
