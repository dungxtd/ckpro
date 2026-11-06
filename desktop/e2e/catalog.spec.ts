import { expect, test } from "@playwright/test";
import { calls, launch } from "./backend";

const exam = "/exams?exam=cka-001";

test("an exam starts in either mode", async ({ page }) => {
	await launch(page, exam, { start_exam: null });
	await expect(
		page.getByRole("heading", { name: "CKA Practice Lab - Core Concepts" })
	).toBeVisible();
	await expect(page.getByText("Needs ~4.0 GB of Docker's 5.8 GB")).toBeVisible();
	await page.getByRole("button", { name: "Practice", exact: true }).click();
	await page.getByRole("button", { name: "Start exam" }).click();
	expect(await calls(page, "start_exam")).toEqual([
		{ id: "cka-001", mode: "practice", replace: false },
		{ id: "cka-001", mode: "exam", replace: false },
	]);
});

test("clusters that exist already are replaced only once the candidate says so", async ({
	page,
}) => {
	await launch(page, exam, {
		start_exam: {
			$error: {
				code: "invalid",
				message: "cluster k8s already exists; starting the exam replaces it",
			},
		},
	});
	await page.getByRole("button", { name: "Start exam" }).click();
	await expect(
		page.getByText("cluster k8s already exists; starting the exam replaces it")
	).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByText("cluster k8s already exists")).toHaveCount(0);

	await page.getByRole("button", { name: "Start exam" }).click();
	await page.getByRole("button", { name: "Replace and start" }).click();
	expect((await calls(page, "start_exam")).at(-1)).toEqual({
		id: "cka-001",
		mode: "exam",
		replace: true,
	});
});

test("an exam that cannot start says why", async ({ page }) => {
	await launch(page, exam, {
		start_exam: { $error: { code: "invalid", message: "Not enough memory: the exam needs 4 GB" } },
	});
	await page.getByRole("button", { name: "Start exam" }).click();
	await expect(page.getByText("Not enough memory: the exam needs 4 GB")).toBeVisible();
});

test("without Docker an exam cannot start", async ({ page }) => {
	await launch(page, exam, {
		env_state: { docker: { state: "down", reason: "no engine answers" }, clusters: [], issues: [] },
	});
	await expect(page.getByRole("button", { name: "Start exam" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Practice", exact: true })).toBeDisabled();
});

test("the sidebar opens each exam of the catalog", async ({ page }) => {
	await launch(page, "/exams");
	await page.getByRole("button", { name: /^Kubernetes Security Essentials/ }).click();
	await expect(
		page.getByRole("heading", { name: "CKS Practice Lab - Kubernetes Security Essentials" })
	).toBeVisible();
});
