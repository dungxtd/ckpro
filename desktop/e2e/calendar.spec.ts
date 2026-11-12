import { expect, test } from "@playwright/test";
import { calls, launch, reply } from "./backend";

test("an exam planned on a day can be undone", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05", { plan_add: 9, plan_remove: null });
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" }).fill("helm");
	await page.keyboard.press("Enter");
	expect(await calls(page, "plan_add")).toEqual([
		{ day: "2026-11-05", examId: "helm-001", mode: "practice" },
	]);
	await page.getByRole("button", { name: "Undo" }).click();
	await expect.poll(() => calls(page, "plan_remove")).toEqual([{ id: 9 }]);
});

test("a plan is taken as an exam, or removed", async ({ page }) => {
	await launch(page, "/calendar?day=2026-10-27", { plan_update: null, plan_remove: null });
	await page
		.getByRole("button", { name: "CKA Practice Lab - Advanced Administration: take it as an exam" })
		.click();
	await expect.poll(() => calls(page, "plan_update")).toEqual([{ id: 3, day: null, mode: "exam" }]);
	// Another day of the week, picked from the week strip
	await page.getByRole("button", { name: /Saturday, October 31/ }).click();
	await page.getByRole("button", { name: "Remove Helm Fundamentals Lab" }).click();
	await expect.poll(() => calls(page, "plan_remove")).toHaveLength(1);
});

test("a plan that cannot be kept says why", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05");
	await reply(page, "plan_add", { $error: { code: "not_found", message: "no exam 'gone'" } });
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" }).fill("Core");
	await page.keyboard.press("Enter");
	await expect(page.getByText("no exam 'gone'")).toBeVisible();
});

test("the calendar asks for plans in the candidate's own time", async ({ page }) => {
	await launch(page, "/calendar");
	await expect.poll(async () => (await calls(page, "plans_between")).length).toBeGreaterThan(0);
	const [first] = (await calls(page, "plans_between")) as { offsetMinutes: number }[];
	expect(first.offsetMinutes).toBe(await page.evaluate(() => -new Date().getTimezoneOffset()));
});

test("the exams prepared for are set in the Calendar: added, changed, removed", async ({
	page,
}) => {
	await launch(page, "/calendar");
	// The fixture aims at CKA; CKAD is added beside it
	await page.getByRole("button", { name: "Add an exam you prepare for" }).click();
	await page.getByRole("radio", { name: "CKAD" }).click();
	await page.getByLabel("Exam day").fill("2027-03-20");
	await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
	const saved = async () => {
		const all = await calls(page, "save_settings");
		return (all.at(-1) as { settings: { targets: { certification: string; date: string }[] } })
			.settings.targets;
	};
	expect((await saved()).map(t => `${t.certification} ${t.date}`)).toEqual([
		"cka 2026-12-15",
		"ckad 2027-03-20",
	]);
	// CKA removed: CKAD stays
	await page.getByRole("button", { name: /CKA exam on 2026-12-15/ }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
	expect((await saved()).map(t => t.certification)).toEqual(["ckad"]);
});

test("the map opens a day: its week and its plans below", async ({ page }) => {
	await launch(page, "/calendar");
	await expect(page.getByRole("group", { name: "Best score by day" })).toBeVisible();
	// A day on the map picked: the week strip and the day follow it
	await page.getByRole("button", { name: /Sat, Oct 31|Sat 31 Oct/ }).click();
	await expect(page).toHaveURL(/day=2026-10-31/);
	await expect(page.getByText("Planned, not taken")).toBeVisible();
});
