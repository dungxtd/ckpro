import { cn } from "@ckpro/ui/lib/utils";
import { Check } from "lucide-react";
import { Group } from "@/components/settings/layout";
import { useSettings } from "@/stores/settings";
import type { Theme } from "@/tauri/api";
import { pickTheme } from "@/theme";

/** The themes, as Settings names them */
export const THEMES: { value: Theme; label: string }[] = [
	{ value: "system", label: "Auto" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

/** How the app looks: light, dark, or as the system is */
export function AppearanceSettings() {
	return (
		<Group
			title="Theme"
			description="Auto follows the system's light and dark. The exam desktop keeps its own look, as on the exam."
		>
			<ThemePicker />
		</Group>
	);
}

/**
 * The themes as small windows of the app, one picked: radio buttons (arrow
 * keys move the choice), the new look spreading from the window picked
 */
function ThemePicker() {
	const theme = useSettings(s => s.settings.theme);
	return (
		<div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-5 px-4 pt-4 pb-3">
			{THEMES.map(t => (
				<label
					key={t.value}
					className="group/theme flex cursor-pointer flex-col items-center gap-2"
				>
					<input
						type="radio"
						name="theme"
						value={t.value}
						checked={theme === t.value}
						onChange={e => {
							const box = e.currentTarget.parentElement?.getBoundingClientRect();
							pickTheme(
								t.value,
								box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 0, y: 0 }
							);
						}}
						className="peer sr-only"
					/>
					<span
						className={cn(
							"relative h-17 w-27 overflow-hidden rounded-lg shadow-sm ring-1 ring-border",
							"transition-[translate,scale,box-shadow] duration-200 group-hover/theme:-translate-y-0.5 group-active/theme:scale-96",
							"peer-checked:shadow-md peer-checked:ring-3 peer-checked:ring-highlight peer-focus-visible:outline-2 peer-focus-visible:outline-highlight peer-focus-visible:outline-offset-3",
							"motion-reduce:transition-none"
						)}
					>
						{t.value === "system" ? (
							<>
								<Window look="light" />
								{/* Dark on the left, light on the right: either, as the system is */}
								<span className="absolute inset-0 [clip-path:polygon(0_0,62%_0,38%_100%,0_100%)]">
									<Window look="dark" />
								</span>
							</>
						) : (
							<Window look={t.value} />
						)}
						{/* The pick's mark, popping in */}
						<span className="absolute right-1.5 bottom-1.5 grid size-4.5 scale-0 place-items-center rounded-full bg-highlight text-highlight-foreground transition-[scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-has-checked/theme:scale-100 motion-reduce:transition-none">
							<Check aria-hidden strokeWidth={3.5} className="size-2.75" />
						</span>
					</span>
					<span className="text-caption text-muted-foreground peer-checked:font-semibold peer-checked:text-foreground">
						{t.label}
					</span>
				</label>
			))}
		</div>
	);
}

/** The app's window in small, in its own look's tokens */
function Window({ look }: { look: "light" | "dark" }) {
	return (
		<span data-theme={look} className="absolute inset-0 grid grid-cols-[26%_1fr] bg-background">
			<span className="border-border border-r bg-sidebar-panel px-1.5 pt-3">
				<span className="block h-1 rounded-full bg-highlight" />
			</span>
			<span className="flex flex-col gap-1.5 p-2">
				<span className="block h-1.5 w-3/5 rounded-full bg-muted-foreground/40" />
				<span className="block h-1.5 rounded-full bg-card" />
				<span className="block h-1.5 rounded-full bg-card" />
			</span>
		</span>
	);
}
