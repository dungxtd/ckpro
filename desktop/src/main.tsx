import { Toaster } from "@ckiu/ui/components/sonner";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import { Playground } from "@/routes/playground";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<HashRouter>
			<Routes>
				<Route path="*" element={<Playground />} />
			</Routes>
		</HashRouter>
		<Toaster />
	</StrictMode>
);
