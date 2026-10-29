import type { ModelOption } from "@/tauri/api";

/** What each family is for, in a few words (the agent's own lines are long) */
const BLURBS: [RegExp, string][] = [
	[/fable/i, "For your toughest challenges"],
	[/opus/i, "For complex work and everyday tasks"],
	[/sonnet/i, "Most efficient for simpler tasks"],
	[/haiku/i, "Fastest for quick answers"],
];

/** A model's line under its name: what it is for; the default says what it
 * picks ("Opus") */
export const blurb = (m: ModelOption) =>
	m.value === "default"
		? `Claude Code's pick${m.description ? `: ${m.description}` : ""}`
		: (BLURBS.find(([family]) => family.test(m.value) || family.test(m.name))?.[1] ??
			m.description?.split("·").at(-1)?.trim());

/** "Default (recommended)" is just Default here: its line says the rest */
export const shortName = (m: ModelOption | undefined, name: string) =>
	m?.value === "default" ? "Default" : name;

/** An effort level as people say it ("xhigh" is Extra) */
const EFFORTS: Record<string, string> = { default: "Auto", xhigh: "Extra" };
export const effortLabel = (value: string, name?: string) =>
	EFFORTS[value] ?? name ?? value.charAt(0).toUpperCase() + value.slice(1);
