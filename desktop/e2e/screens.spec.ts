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

test("Home is arranged: a module hidden and shown from Manage modules, one moved by keyboard", async ({
	page,
}) => {
	await launch(page, "/");
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
	await page.getByRole("button", { name: "Manage modules" }).click();
	await page.getByRole("button", { name: "Recent", pressed: true }).click();
	await expect(page.getByRole("group", { name: "Recent" })).toHaveCount(0);
	expect((await saved()).hidden).toEqual(["recent"]);
	await page.getByRole("button", { name: "Recent", pressed: false }).click();
	await expect(page.getByRole("group", { name: "Recent" })).toBeVisible();
	// Moving: from the same popover, opened again
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Manage modules" }).click();
	await page.getByRole("button", { name: "Move modules…" }).click();
	const passed = page.getByRole("group", { name: "Passed" });
	await passed.focus();
	await page.keyboard.press("Space");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Space");
	expect((await saved()).places.find(p => p.module === "passed")).toMatchObject({ x: 2 });
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

test("a module dragged stays under the pointer as the others make room", async ({ page }) => {
	await page.setViewportSize({ width: 1300, height: 1400 });
	await launch(page, "/");
	await page.getByRole("button", { name: "Manage modules" }).click();
	await page.getByRole("button", { name: "Move modules…" }).click();
	const m = page.getByRole("group", { name: "Passed" });
	const b = await m.boundingBox();
	if (!b) throw new Error("Passed is not laid out");
	const sx = b.x + 20,
		sy = b.y + 20;
	await page.mouse.move(sx, sy);
	await page.mouse.down();
	const offs: [number, number][] = [];
	for (let i = 1; i <= 25; i++) {
		const x = sx - i * 22,
			y = sy + i * 8;
		await page.mouse.move(x, y);
		await page.waitForTimeout(30);
		const r = await m.boundingBox();
		if (!r) throw new Error("Passed is gone");
		offs.push([x - r.x, y - r.y]);
	}
	await page.mouse.up();
	// Where it was held stays where the pointer is (no jump as the slot moves)
	for (const [dx, dy] of offs) {
		expect(Math.abs(dx - 20)).toBeLessThan(10);
		expect(Math.abs(dy - 20)).toBeLessThan(10);
	}
});

const activity = (id: number, status: string, title: string) => ({
	id,
	title,
	steps: ["Creating cluster k8s"],
	current: 0,
	detail: null,
	status,
	error: status === "failed" ? "kind failed" : "Cancelled",
	started_at: Date.parse("2026-11-02T09:58:00"),
	finished_at: Date.parse("2026-11-02T09:59:00"),
	log: [],
});

test("the top bar says nothing of a set-up cancelled on purpose", async ({ page }) => {
	await launch(page, "/", { activities: [activity(2, "cancelled", "Set up CKA Core Concepts")] });
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect(page.getByRole("button", { name: /Set up CKA Core Concepts/ })).toHaveCount(0);
});

test("the top bar shows a failure as an icon whose words slide out under the pointer", async ({
	page,
}) => {
	await launch(page, "/", { activities: [activity(3, "failed", "Create cluster k8s")] });
	const chip = page.getByRole("button", { name: "Failed: Create cluster k8s" });
	await expect(chip).toBeVisible();
	const words = chip.getByText("Failed: Create cluster k8s");
	expect((await words.boundingBox())?.width ?? 0).toBeLessThan(2);
	await chip.hover();
	await expect.poll(async () => (await words.boundingBox())?.width ?? 0).toBeGreaterThan(40);
});

test("today's next exam starts at once; a plan pressed starts once confirmed", async ({ page }) => {
	const first = { ...sample.plans[0], id: 901, day: "2026-11-02", done: null, mode: "practice" };
	const second = { ...first, id: 902, mode: "exam" };
	await launch(page, "/", { plans_between: [first, second], start_exam: null });
	await expect(page.getByText("0 of 2 done")).toBeVisible();
	// One way to start the next one, not a button per plan beside it
	await page.getByRole("button", { name: "Start next" }).click();
	expect(await calls(page, "start_exam")).toEqual([
		{ id: first.exam_id, mode: "practice", replace: false },
	]);
	// A plan pressed asks first; Cancel starts nothing
	await page.getByRole("button", { name: /^Start exam: / }).click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("Timed as the real exam");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	expect(await calls(page, "start_exam")).toHaveLength(1);
	await page.getByRole("button", { name: /^Start exam: / }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Start" }).click();
	await expect.poll(() => calls(page, "start_exam")).toHaveLength(2);
	expect((await calls(page, "start_exam"))[1]).toEqual({
		id: first.exam_id,
		mode: "exam",
		replace: false,
	});
});

test("Home's Plan today plans in place, with the Calendar's picker", async ({ page }) => {
	await launch(page, "/", { plan_add: 8 });
	await page.getByRole("button", { name: "Plan today" }).click();
	const field = page.getByRole("searchbox", { name: "Plan an exam, 2026-11-02" });
	await field.fill("helm");
	await field.press("Enter");
	expect((await calls(page, "plan_add")).at(-1)).toMatchObject({
		day: "2026-11-02",
		examId: "helm-001",
	});
	await expect(page).toHaveURL(/\/$/);
});
