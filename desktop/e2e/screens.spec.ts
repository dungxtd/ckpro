import { expect, test } from "@playwright/test";
import { calls, launch, sample } from "./backend";

test("Home shows its modules: today, the exam day, the practice map", async ({ page }) => {
	await launch(page, "/");
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect(page.getByRole("group", { name: "Today" })).toBeVisible();
	await expect(page.getByText("days to")).toBeVisible();
	await expect(page.getByRole("group", { name: "Practice map" })).toBeVisible();
	await expect(page.getByRole("group", { name: "Recent" })).toBeVisible();
});

test("Home is arranged: a module hidden, moved by keyboard, saved", async ({ page }) => {
	await launch(page, "/");
	await page.getByRole("button", { name: "Manage modules" }).click();
	await page.getByRole("button", { name: "Hide Recent" }).click();
	await expect(page.getByRole("group", { name: "Recent" })).toHaveCount(0);
	const saved = async () => {
		const all = await calls(page, "save_settings");
		return (
			all.at(-1) as {
				settings: {
					home: {
						custom: boolean;
						hidden: string[];
						places: { module: string; x: number; y: number }[];
					};
				};
			}
		).settings.home;
	};
	expect((await saved()).hidden).toEqual(["recent"]);
	// Passed lifted, moved a column left, dropped
	const passed = page.getByRole("group", { name: "Passed" });
	await passed.focus();
	await page.keyboard.press("Space");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Space");
	const home = await saved();
	expect(home.custom).toBe(true);
	expect(home.places.find(p => p.module === "passed")).toMatchObject({ x: 2 });
	// Added back from the tray
	await page.getByRole("button", { name: "Add Recent" }).click();
	await expect(page.getByRole("group", { name: "Recent" })).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();
});

test("Home with nothing yet invites a first step", async ({ page }) => {
	await launch(page, "/", {
		exam_history: [],
		plans_between: [],
		settings: { ...sample.settings, targets: [], target: null },
	});
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	// Someone new: what to do first, where to set the exam day, the map to fill
	await expect(page.getByText("Each day you practise fills a square")).toBeVisible();
	await expect(page.getByRole("link", { name: "Set it in Calendar" })).toBeVisible();
	await expect(page.getByRole("group", { name: "Recent" })).toHaveCount(0);
});

test("an exam picked that was deleted says so, not another in its place", async ({ page }) => {
	await launch(page, "/exams?exam=mine/custom/gone");
	await expect(page.getByText("This exam is not here any more")).toBeVisible();
	await page.getByRole("button", { name: "Show the exams" }).click();
	await expect(
		page.getByRole("heading", { name: "CKA Practice Lab - Core Concepts" })
	).toBeVisible();
});

test("History lists every attempt, newest first", async ({ page }) => {
	await launch(page, "/history");
	await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
	const rows = page.getByRole("row");
	// A header, then one row per attempt
	await expect(rows).toHaveCount(sample.history.length + 1);
	await expect(rows.nth(1)).toContainText("CKA Practice Lab - Core Concepts");
	await expect(rows.nth(1)).toContainText("94%");
});
