import { reducedMotion } from "@ckpro/ui/lib/motion";
import { useCallback, useEffect, useState } from "react";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { Greeting } from "./greeting";
import { Setup } from "./setup";

/**
 * The first launch: the greeting, then the setup, then the app. Seen
 * through or skipped, it is not shown again (Settings' `welcomed`); quit
 * midway, it opens the setup again where it was left. Esc skips the
 * greeting to the setup
 */
export function Onboarding() {
	const update = useSettings(s => s.update);
	const askStart = useExam(s => s.askStart);
	const [still] = useState(reducedMotion);
	// A setup left midway (the app quit) opens again where it was, the
	// greeting seen already
	const [part, setPart] = useState<"greeting" | "setup">(() =>
		useSettings.getState().settings.setup_step ? "setup" : "greeting"
	);
	const toSetup = useCallback(() => {
		setPart("setup");
		if (!useSettings.getState().settings.setup_step) update({ setup_step: "docker" });
	}, [update]);
	useEffect(() => {
		if (part !== "greeting") return;
		const keys = (e: KeyboardEvent) => {
			if (e.key === "Escape") toSetup();
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	}, [part, toSetup]);
	const done = (start?: { id: string; title: string }) => {
		update({ welcomed: true, setup_step: null });
		if (start) askStart(start.id, "practice", start.title);
	};
	return part === "greeting" ? (
		<Greeting still={still} onNext={toSetup} />
	) : (
		<div className="h-full animate-enter">
			<Setup onDone={done} />
		</div>
	);
}
