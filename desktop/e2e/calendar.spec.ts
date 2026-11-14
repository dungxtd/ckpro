import { expect, test } from "@playwright/test";
import { calls, launch, reply, sample } from "./backend";

test("an exam planned on a day can be undone", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05", { plan_add: 9, plan_remove: null });
	await page.getByRole("button", { name: /^Plan on/ }).click();
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
	// Another plan of that week, in the agenda
	await page.getByRole("button", { name: "Remove Helm Fundamentals Lab" }).click();
	await expect.poll(() => calls(page, "plan_remove")).toHaveLength(1);
});

test("a plan that cannot be kept says why", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05");
	await reply(page, "plan_add", { $error: { code: "not_found", message: "no exam 'gone'" } });
	await page.getByRole("button", { name: /^Plan on/ }).click();
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

test("a segmented control is one Tab stop: the arrows choose, Home and End go to the ends", async ({
	page,
}) => {
	await launch(page, "/calendar");
	await page.getByRole("button", { name: "Add an exam you prepare for" }).click();
	const radios = page.getByRole("radiogroup", { name: "Certification" }).getByRole("radio");
	const last = (await radios.count()) - 1;
	expect(last).toBeGreaterThan(0);
	const chosen = async (i: number) => {
		await expect(radios.nth(i)).toBeChecked();
		await expect(radios.nth(i)).toBeFocused();
		await expect(page.getByRole("radiogroup").locator("[tabindex='0']")).toHaveCount(1);
	};
	await radios.first().focus();
	await page.keyboard.press("ArrowRight");
	await chosen(1);
	await page.keyboard.press("End");
	await chosen(last);
	await page.keyboard.press("ArrowDown");
	await chosen(0);
	await page.keyboard.press("ArrowLeft");
	await chosen(last);
	await page.keyboard.press("Home");
	await chosen(0);
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
	await expect(page.getByText("not taken").first()).toBeVisible();
});

test("the chip to an exam out of view takes the map there and goes, with no tip left", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1000, height: 800 });
	await launch(page, "/calendar", {
		settings: {
			...sample.settings,
			targets: [
				...sample.settings.targets,
				{ certification: "cks", date: "2027-06-30", started: "2026-11-01", rest_days: [] },
			],
		},
	});
	await page.getByRole("button", { name: /^CKS .* ›$/ }).click();
	await expect(page.getByRole("button", { name: /^CKS .* ›$/ })).toHaveCount(0);
	await page.waitForTimeout(800);
	await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("a right click opens no browser menu", async ({ page }) => {
	await launch(page, "/calendar");
	await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
	const stopped = await page.evaluate(() => {
		const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
		document.querySelector("h1")?.dispatchEvent(e);
		return e.defaultPrevented;
	});
	expect(stopped).toBe(true);
});

test("a plan of the day pressed starts once confirmed", async ({ page }) => {
	const plan = { ...sample.plans[0], id: 903, day: "2026-11-02", done: null, mode: "practice" };
	await launch(page, "/calendar?day=2026-11-02", { plans_between: [plan], start_exam: null });
	await page
		.getByRole("button", { name: /^Start practice: / })
		.first()
		.click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Start" }).click();
	await expect
		.poll(() => calls(page, "start_exam"))
		.toEqual([{ id: plan.exam_id, mode: "practice", replace: false }]);
});

test("an exam is planned as an exam or as practice, the way the last one was", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05", { plan_add: 9 });
	await page.getByRole("button", { name: /^Plan on/ }).click();
	// Most attempts in the fixture are practice: the switch starts there
	await expect(page.getByRole("radio", { name: "Practice" })).toBeChecked();
	const field = page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" });
	await field.fill("helm");
	await field.press("Tab");
	await expect(page.getByRole("radio", { name: "Exam" })).toBeChecked();
	await field.press("Enter");
	expect(await calls(page, "plan_add")).toEqual([
		{ day: "2026-11-05", examId: "helm-001", mode: "exam" },
	]);
	const saved = await calls(page, "save_settings");
	expect((saved.at(-1) as { settings: { plan_mode: string } }).settings.plan_mode).toBe("exam");
});
