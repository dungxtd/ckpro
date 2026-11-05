import { expect, test } from "@playwright/test";
import { launch, sample } from "./backend";

test("Home shows the target, the day and the prep map", async ({ page }) => {
	await launch(page, "/");
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect(page.getByText("kubectl get exam cka")).toBeVisible();
	await expect(page.getByText("Prep map")).toBeVisible();
});

test("Home with nothing yet invites a first step", async ({ page }) => {
	await launch(page, "/", {
		exam_history: [],
		plans_between: [],
		settings: { ...sample.settings, target: null },
	});
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect(
		page.getByText("No resources found. Set the exam you prepare for below.")
	).toBeVisible();
	await expect(page.getByText("Your study days show here")).toBeVisible();
	await expect(page.getByText("Set a target to measure")).toBeVisible();
	// The command line is filled in, ready to set one
	await expect(page.getByRole("textbox", { name: /Command/ })).toHaveValue(/^kubectl set exam /);
});

test("an exam picked that was deleted says so, not another in its place", async ({ page }) => {
	await launch(page, "/exams?exam=mine/custom/gone");
	await expect(page.getByText("This exam is not here any more")).toBeVisible();
	await page.getByRole("button", { name: "Show the exams" }).click();
	await expect(
		page.getByRole("heading", { name: "CKA Practice Lab - Core Concepts" })
	).toBeVisible();
});
