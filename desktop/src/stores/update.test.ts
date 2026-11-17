import { describe, expect, it, vi } from "vitest";

// The store's module reaches Tauri; its helpers do not
vi.mock("@/tauri/api", () => ({ updateApi: {}, browserApi: {}, errorText: String }));
const { ago, isRequired, releaseUrl, size } = await import("./update");

describe("update helpers", () => {
	it("says sizes as people read them", () => {
		expect(size(0)).toBe("1 MB");
		expect(size(38 * 1_048_576)).toBe("38 MB");
		expect(size(1.25 * 1024 * 1_048_576)).toBe("1.3 GB");
	});

	it("says how long ago a check was", () => {
		const now = Date.UTC(2026, 10, 17, 12);
		expect(ago(now - 20_000, now)).toBe("just now");
		expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
		expect(ago(now - 2 * 3_600_000, now)).toBe("2 h ago");
		expect(ago(now - 26 * 3_600_000, now)).toBe("yesterday");
		expect(ago(now - 3 * 86_400_000, now)).toBe("3 days ago");
	});

	it("knows a required update by its state", () => {
		const ready = {
			state: "ready",
			version: "0.4.0",
			notes: "",
			required: true,
			blocked: null,
			on_quit: true,
		} as const;
		expect(isRequired(ready)).toBe(true);
		expect(isRequired({ ...ready, required: false })).toBe(false);
		expect(isRequired({ state: "idle", checked_at: null })).toBe(false);
	});

	it("points at a release's page", () => {
		expect(releaseUrl("0.4.0")).toBe("https://github.com/dungxtd/ckpro/releases/tag/v0.4.0");
	});
});
