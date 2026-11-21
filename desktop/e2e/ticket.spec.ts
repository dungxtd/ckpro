import type { Page } from "@playwright/test";
import { launch, withSettings } from "./backend";
import { expect, test } from "./fixture";

/** A goal added in the first launch's setup: its ticket prints and falls */
async function printGoal(page: Page) {
	await launch(page, "/", {
		settings: withSettings({ welcomed: false, setup_step: "exams", targets: [] }),
		exam_history: [],
	});
	await page.getByRole("button", { name: /^CKA Kubernetes Administrator/ }).click();
	await page.getByRole("button", { name: "Not yet" }).click();
	await page.getByRole("button", { name: "Add" }).click();
	const ticket = page.locator(".ticket").first();
	await expect(ticket).toHaveAttribute("data-live", "");
	return ticket;
}

test("a goal's ticket lands, its stamp comes down, and it goes on its own", async ({ page }) => {
	await printGoal(page);
	await expect(page.locator(".ticket-stamp")).toHaveCSS("opacity", "0.75", { timeout: 4000 });
	await expect(page.locator(".ticket")).toHaveCount(0, { timeout: 8000 });
});

test("held, the ticket stays; let go, it falls out of the window", async ({ page }) => {
	const ticket = await printGoal(page);
	await page.waitForTimeout(1500);
	const box = await ticket.boundingBox();
	if (!box) throw new Error("no ticket");
	await page.mouse.move(box.x + 60, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(600, 300, { steps: 8 });
	// Longer than it stays left alone
	await page.waitForTimeout(6000);
	await expect(ticket).toBeVisible();
	await page.mouse.up();
	await expect(page.locator(".ticket")).toHaveCount(0, { timeout: 3000 });
});

test("the stub pulled along the ticket tears off", async ({ page }) => {
	const ticket = await printGoal(page);
	await page.waitForTimeout(1500);
	const stub = await ticket.locator(".ticket-stub").boundingBox();
	if (!stub) throw new Error("no stub");
	await page.mouse.move(stub.x + stub.width / 2, stub.y + stub.height / 2);
	await page.mouse.down();
	await page.mouse.move(stub.x + 260, stub.y - 80, { steps: 10 });
	await expect(page.locator(".ticket-torn")).toBeVisible();
	await expect(ticket.locator(".ticket-stub")).toBeHidden();
	await page.mouse.up();
});
