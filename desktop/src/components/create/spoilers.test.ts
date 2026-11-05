import { describe, expect, it } from "vitest";
import { withoutSpoilers } from "./spoilers";

describe("withoutSpoilers", () => {
	it("takes out the solution and hints, whatever their place", () => {
		const yaml = [
			"title: T",
			"setup: |",
			"  kubectl create ns a",
			"solution:",
			"  run: |",
			"    kubectl -n a create deploy web",
			"  explain: Create it",
			"hints:",
			"  - kubectl create",
			"checks:",
			"  - name: C",
		].join("\n");
		const { shown, hidden } = withoutSpoilers(yaml);
		expect(hidden).toBe(true);
		expect(shown).toBe("title: T\nsetup: |\n  kubectl create ns a\nchecks:\n  - name: C");
	});
	it("leaves a question without them as it is", () => {
		expect(withoutSpoilers("title: T\nsetup: x")).toEqual({
			shown: "title: T\nsetup: x",
			hidden: false,
		});
	});
});
