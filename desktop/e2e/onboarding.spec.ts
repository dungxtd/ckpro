import { calls, launch, typeDay, withSettings } from "./backend";
import { expect, test } from "./fixture";

const saved = async (page: Parameters<typeof calls>[0]) =>
	(
		((await calls(page, "save_settings")).at(-1) ?? { settings: {} }) as {
			settings: { welcomed: boolean; targets: { certification: string }[] };
		}
	).settings;

test("the first launch greets, sets up, and is not shown again", async ({ page }) => {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, targets: [] }),
		exam_history: [],
	});
	await page.getByRole("button", { name: "Get started" }).click();
	await expect(page.getByRole("heading", { name: "OrbStack is ready" })).toBeVisible();
	await page.getByRole("button", { name: "Continue" }).click();
	// One question at a time, nothing filled in: the exam, not booked, a goal
	await page.getByRole("button", { name: /^CKA Kubernetes Administrator/ }).click();
	await page.getByRole("button", { name: "Not yet" }).click();
	await page.getByRole("button", { name: "In 2 months" }).click();
	expect((await saved(page)).targets.map(t => t.certification)).toEqual(["cka"]);
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page.getByRole("switch", { name: "Use the assistant" })).toBeVisible();
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Go to Home" }).click();
	expect((await saved(page)).welcomed).toBe(true);
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});

test("with Docker not running the first practice is left for later", async ({ page }) => {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, targets: [] }),
		exam_history: [],
		env_retry: null,
		env_state: { docker: { state: "down", reason: "no engine answers" }, clusters: [], issues: [] },
	});
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
	await page.getByRole("button", { name: "Set up later" }).click();
	await page.getByRole("button", { name: "Skip for now" }).click();
	await expect(page.getByText("Once Docker runs, Home offers your first practice")).toBeVisible();
	// Its dot back to the exams, then on again: no first practice step
	await page.getByRole("button", { name: "Your exams" }).click();
	await expect(
		page.getByRole("heading", { name: "Which exams are you preparing for?" })
	).toBeVisible();
	await page.getByRole("button", { name: "Skip for now" }).click();
	await page.getByRole("button", { name: "Finish" }).click();
	expect((await saved(page)).welcomed).toBe(true);
});

test("a setup left midway opens again where it was, its steps before it seen", async ({ page }) => {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, setup_step: "assistant" }),
		exam_history: [],
	});
	await expect(page.getByRole("switch", { name: "Use the assistant" })).toBeVisible();
	await page.getByRole("button", { name: "Continue" }).click();
	await expect
		.poll(async () => ((await saved(page)) as unknown as { setup_step: string }).setup_step)
		.toBe("ready");
	await page.getByRole("button", { name: "Docker" }).click();
	await expect(page.getByRole("heading", { name: "OrbStack is ready" })).toBeVisible();
});

test("Esc skips the greeting to the setup", async ({ page }) => {
	await launch(page, "/", { settings: withSettings({ welcomed: false }), exam_history: [] });
	await page.keyboard.press("Escape");
	await expect(page.getByRole("heading", { name: "OrbStack is ready" })).toBeVisible();
});

test("one who used the app before is not greeted", async ({ page }) => {
	await launch(page, "/", { settings: withSettings({ welcomed: false }) });
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect.poll(async () => (await saved(page)).welcomed).toBe(true);
});

test("an exam is asked for, its day empty; the day typed and settled prints its ticket", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1180, height: 800 });
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, setup_step: "exams" }),
		exam_history: [],
	});
	// targets from the fixture are there already: nothing prints by itself
	await page.waitForTimeout(1500);
	await expect(page.locator(".ticket")).toHaveCount(0);
	await page.getByRole("button", { name: "Another exam" }).click();
	await page.getByRole("button", { name: /^CKAD/ }).click();
	await page.getByRole("button", { name: "Yes, I have a day" }).click();
	await expect(page.getByRole("textbox", { name: "CKAD exam day" })).toHaveValue("");
	await expect(page.locator(".ticket")).toHaveCount(0);
	await typeDay(page, "CKAD exam day", "2027-03-20");
	await expect(page.locator(".ticket")).toHaveCount(1);
});

test("the last exam removed, the setup asks for one again", async ({ page }) => {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, setup_step: "exams" }),
		exam_history: [],
	});
	const remove = page.getByRole("button", { name: "Remove" });
	while ((await remove.count()) > 0) await remove.first().click();
	await expect(page.getByRole("button", { name: /^CKA\b/ })).toBeVisible();
});

test("a day typed, then Not yet, is no booking: the goal is asked for", async ({ page }) => {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, setup_step: "exams", targets: [] }),
		exam_history: [],
	});
	await page.getByRole("button", { name: /^CKAD/ }).click();
	await page.getByRole("button", { name: "Yes, I have a day" }).click();
	await page.getByRole("textbox", { name: "CKAD exam day" }).pressSequentially("20032027");
	await page.getByRole("button", { name: "Not yet" }).click();
	await expect(page.getByText("When would you like to be ready?")).toBeVisible();
	await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
	await expect(page.locator(".ticket")).toHaveCount(0);
});
