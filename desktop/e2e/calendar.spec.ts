import { expect, test } from "@playwright/test";
import { calls, launch, reply } from "./backend";

test("an exam planned on a day can be undone", async ({ page }) => {
	await launch(page, "/calendar", { plan_add: 9, plan_remove: null });
	await expect(page.getByText("November 2026")).toBeVisible();
	await page.getByRole("button", { name: "Plan an exam on 2026-11-05" }).click();
	await page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" }).fill("helm");
	await page.keyboard.press("Enter");
	expect(await calls(page, "plan_add")).toEqual([
		{ day: "2026-11-05", examId: "helm-001", mode: "practice" },
	]);
	await page.getByRole("button", { name: "Undo" }).click();
	await expect.poll(() => calls(page, "plan_remove")).toEqual([{ id: 9 }]);
});

test("a plan is taken as an exam, or removed", async ({ page }) => {
	await launch(page, "/calendar", { plan_update: null, plan_remove: null });
	await page
		.getByRole("button", { name: "CKA Practice Lab - Advanced Administration: take it as an exam" })
		.click();
	await expect.poll(() => calls(page, "plan_update")).toEqual([{ id: 3, day: null, mode: "exam" }]);
	await page.getByRole("button", { name: "Remove Helm Fundamentals Lab" }).click();
	await expect.poll(() => calls(page, "plan_remove")).toHaveLength(1);
});

test("a plan that cannot be kept says why", async ({ page }) => {
	await launch(page, "/calendar");
	await reply(page, "plan_add", { $error: { code: "not_found", message: "no exam 'gone'" } });
	await page.getByRole("button", { name: "Plan an exam on 2026-11-05" }).click();
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
