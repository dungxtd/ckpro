import { describe, expect, it } from "vitest";
import { blurb, effortLabel, shortName } from "./models";

const model = (value: string, name: string, description: string | null) => ({
	value,
	name,
	description,
});

describe("model labels", () => {
	it("says what each family is for, in a few words", () => {
		expect(blurb(model("opus", "Opus 5.5", "Opus 5.5 · Best for everyday, complex tasks"))).toBe(
			"For complex work and everyday tasks"
		);
		expect(blurb(model("claude-fable-5-1[1m]", "Fable 5.1", "long"))).toBe(
			"For your toughest challenges"
		);
	});

	it("keeps the agent's own line for a family it does not know", () => {
		expect(blurb(model("nova", "Nova 1", "Nova 1 · Good at maps"))).toBe("Good at maps");
	});

	it("says what the default picks", () => {
		expect(blurb(model("default", "Default (recommended)", "Opus"))).toBe(
			"Claude Code's pick: Opus"
		);
		expect(
			shortName(model("default", "Default (recommended)", null), "Default (recommended)")
		).toBe("Default");
		expect(shortName(model("haiku", "Haiku 5.5", null), "Haiku 5.5")).toBe("Haiku 5.5");
	});

	it("names effort levels as people say them", () => {
		expect(effortLabel("default")).toBe("Auto");
		expect(effortLabel("xhigh", "Xhigh")).toBe("Extra");
		expect(effortLabel("max")).toBe("Max");
	});
});
