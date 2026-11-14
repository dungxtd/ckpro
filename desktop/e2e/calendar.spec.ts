import { calls, launch, reply, sample, withSettings } from "./backend";
import { expect, type Page, test } from "./fixture";

/** The day's own Plan, at the foot of its column */
const planOn = (page: Page, day: string) =>
	page
		.locator(`[data-week-day="${day}"]`)
		.getByRole("button", { name: /^Plan on/ })
		.click();

/** The exams' menu, beside the title */
const examMenu = (page: Page) => page.getByRole("button", { name: "Exams shown" }).click();

test("several exams are planned on a day in one go, with no toast in the way", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05", { plan_add: 9 });
	await planOn(page, "2026-11-05");
	const field = page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" });
	await field.fill("helm");
	await field.press("Enter");
	// Still open, the field cleared and focused, the one planned ticked
	await expect(field).toHaveValue("");
	await expect(field).toBeFocused();
	await expect(
		page.getByRole("button", { name: /Helm Fundamentals Lab/, pressed: true })
	).toBeVisible();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /^Core Concepts/ })
		.click();
	expect((await calls(page, "plan_add")).map(c => (c as { examId: string }).examId)).toEqual([
		"helm-001",
		"cka-001",
	]);
	await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("a plan of the week is removed", async ({ page }) => {
	await launch(page, "/calendar?day=2026-10-27", { plan_remove: null });
	await page.getByRole("button", { name: /^Remove Helm Fundamentals Lab/ }).click();
	await expect.poll(() => calls(page, "plan_remove")).toHaveLength(1);
});

test("a plan that cannot be kept says why", async ({ page }) => {
	await launch(page, "/calendar?day=2026-11-05");
	await reply(page, "plan_add", { $error: { code: "not_found", message: "no exam 'gone'" } });
	await planOn(page, "2026-11-05");
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
	await examMenu(page);
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
	await examMenu(page);
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
	await examMenu(page);
	await page.getByRole("button", { name: /CKA exam on 2026-12-15/ }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
	expect((await saved()).map(t => t.certification)).toEqual(["ckad"]);
});

test("the map opens a day: its week and its plans below", async ({ page }) => {
	await launch(page, "/calendar");
	await expect(page.getByRole("group", { name: "Best score by day" })).toBeVisible();
	// A day on the map picked: its week follows
	await page.getByRole("button", { name: /Sat, Oct 31|Sat 31 Oct/ }).click();
	await expect(page).toHaveURL(/day=2026-10-31/);
	await expect(page.getByText("not taken").first()).toBeVisible();
});

test("the chip to an exam out of view takes the map there and goes, with no tip left", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1000, height: 800 });
	await launch(page, "/calendar", {
		settings: withSettings({
			targets: [
				...sample.settings.targets,
				{ certification: "cks", date: "2027-06-30", started: "2026-11-01", rest_days: [] },
			],
		}),
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
	await planOn(page, "2026-11-05");
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

test("one exam picked in the menu is what the screen shows", async ({ page }) => {
	await launch(page, "/calendar", {
		settings: withSettings({
			targets: [
				...sample.settings.targets,
				{ certification: "ckad", date: "2027-03-20", started: "2026-11-01", rest_days: [] },
			],
		}),
	});
	await examMenu(page);
	await page
		.getByRole("dialog")
		.getByRole("button", { name: /^CKAD Mar/ })
		.click();
	await expect(page.getByRole("button", { name: "Exams shown" })).toHaveText(/CKAD/);
	const saved = await calls(page, "save_settings");
	expect((saved.at(-1) as { settings: { focus: string } }).settings.focus).toBe("ckad");
});

test("a day with a plan still has its own Plan, and picking a day moves nothing", async ({
	page,
}) => {
	const plan = { ...sample.plans[0], id: 904, day: "2026-11-05", done: null };
	await launch(page, "/calendar", { plans_between: [plan] });
	const day = page.locator('[data-week-day="2026-11-05"]');
	await expect(day.getByRole("button", { name: /^Start exam: / })).toBeAttached();
	const before = await day.boundingBox();
	await planOn(page, "2026-11-05");
	await expect(page).toHaveURL(/day=2026-11-05/);
	expect(await day.boundingBox()).toEqual(before);
	await expect(page.getByRole("searchbox", { name: "Plan an exam, 2026-11-05" })).toBeFocused();
});

test("the picker is the day's checklist: planned ones ticked, pressed again they go", async ({
	page,
}) => {
	const plan = { ...sample.plans[0], id: 905, day: "2026-11-05", done: null, mode: "exam" };
	await launch(page, "/calendar", { plans_between: [plan], plan_remove: null, plan_add: 7 });
	await planOn(page, "2026-11-05");
	const menu = page.getByRole("dialog");
	const ticked = menu.getByRole("button", { pressed: true });
	// Planned there already: ticked, with the way it is taken
	await expect(ticked).toHaveCount(1);
	await expect(ticked).toContainText("exam");
	await ticked.click();
	await expect.poll(() => calls(page, "plan_remove")).toEqual([{ id: 905 }]);
	await expect(menu.getByRole("button", { pressed: true })).toHaveCount(0);
	expect(await calls(page, "plan_add")).toEqual([]);
});
