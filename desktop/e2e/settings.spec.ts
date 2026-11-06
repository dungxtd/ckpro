import { expect, test } from "@playwright/test";
import { calls, launch, sample } from "./backend";

test("turning the assistant off is kept", async ({ page }) => {
	await launch(page, "/settings/assistant", { agent_settings: null });
	const assistant = page.getByRole("switch", { name: "Use the assistant" });
	await expect(assistant).toBeChecked();
	await assistant.click();
	await expect
		.poll(
			async () =>
				(
					(await calls(page, "save_settings")).at(-1) as
						| { settings: { assistant_enabled: boolean } }
						| undefined
				)?.settings.assistant_enabled
		)
		.toBe(false);
});

test("analytics can be turned off", async ({ page }) => {
	await launch(page, "/settings", { settings: { ...sample.settings, analytics: true } });
	const analytics = page.getByRole("switch", { name: "Share usage analytics" });
	await expect(analytics).toBeChecked();
	await analytics.click();
	await expect
		.poll(
			async () =>
				(
					(await calls(page, "save_settings")).at(-1) as
						| { settings: { analytics: boolean } }
						| undefined
				)?.settings.analytics
		)
		.toBe(false);
});

test("the version and data folder are shown", async ({ page }) => {
	await launch(page, "/settings");
	await expect(page.getByText("Version 0.1.0")).toBeVisible();
	await expect(page.getByText("Data folder")).toBeVisible();
});
