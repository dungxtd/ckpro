import { calls, launch, withSettings } from "./backend";
import { expect, test } from "./fixture";

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
	await launch(page, "/settings/about", { settings: withSettings({ analytics: true }) });
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
	await launch(page, "/settings/about");
	await expect(page.getByText("Version 0.1.0").first()).toBeVisible();
	await expect(page.getByText("Data folder")).toBeVisible();
});

test("Settings lists its parts; Appearance's theme picked is kept and marked", async ({ page }) => {
	await launch(page, "/settings", { settings: withSettings({ theme: "dark" }) });
	await page.getByRole("button", { name: /Appearance.*Dark/ }).click();
	await expect(page).toHaveURL(/#\/settings\/appearance$/);
	await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
	// The small window is what is pressed (its radio button is under it)
	await page.getByRole("radiogroup", { name: "Theme" }).getByText("Light", { exact: true }).click();
	await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
	await expect
		.poll(
			async () =>
				((await calls(page, "save_settings")).at(-1) as { settings: { theme: string } } | undefined)
					?.settings.theme
		)
		.toBe("light");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	// From the keyboard, arrow keys move the choice, as radio buttons do
	await page.getByRole("radio", { name: "Light" }).focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
	// Back up to the list, which says the theme now
	await page.getByRole("button", { name: "Back" }).click();
	await expect(page).toHaveURL(/#\/settings$/);
	await expect(page.getByRole("button", { name: /Appearance.*Dark/ })).toBeVisible();
});

test("an address that is no page goes back to Settings", async ({ page }) => {
	await launch(page, "/settings/nothing");
	await expect(page).toHaveURL(/#\/settings$/);
});
