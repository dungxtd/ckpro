import { calls, emit, launch, sample, updateReady, upToDate } from "./backend";
import { expect, test } from "./fixture";

/** The update's chip in the title bar's corner */
const chip = (page: import("@playwright/test").Page, name: RegExp) =>
	page.getByRole("button", { name });

test("up to date, the corner says nothing and About says so", async ({ page }) => {
	await launch(page, "/");
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
	await expect(chip(page, /CKPro 0\.4\.0/)).toHaveCount(0);
	await page.goto("/#/settings");
	await expect(page.getByText("CKPro is up to date")).toBeVisible();
	await page.getByRole("button", { name: "Check now" }).click();
	expect(await calls(page, "update_check")).toHaveLength(1);
});

test("a downloaded update announces itself in the corner; its words restart onto it", async ({
	page,
}) => {
	await launch(page, "/", { update_state: updateReady() });
	const restart = chip(page, /Restart to update to CKPro 0\.4\.0/);
	// Its words out by themselves, without the pointer
	const words = restart.getByText("Restart to update to CKPro 0.4.0");
	await expect.poll(async () => (await words.boundingBox())?.width ?? 0).toBeGreaterThan(40);
	await restart.click();
	expect(await calls(page, "update_restart")).toHaveLength(1);
});

test("Not now puts the update away; Rust says it is gone", async ({ page }) => {
	await launch(page, "/", { update_state: updateReady() });
	await page.getByRole("button", { name: "Not now" }).click();
	expect(await calls(page, "update_dismiss")).toHaveLength(1);
	await emit(page, "update-changed", { ...updateReady(), dismissed: true });
	await expect(chip(page, /CKPro 0\.4\.0/)).toHaveCount(0);
});

test("a restart refused says why", async ({ page }) => {
	await launch(page, "/", {
		update_state: updateReady(),
		update_restart: {
			$error: { code: "busy", message: "CKPro restarts to update after your attempt" },
		},
	});
	await chip(page, /Restart to update/).click();
	await expect(page.getByText("CKPro restarts to update after your attempt")).toBeVisible();
});

test("held back by an attempt, the chip says until when and opens About", async ({ page }) => {
	await launch(page, "/", { update_state: updateReady({ blocked: "your attempt" }) });
	await chip(page, /CKPro 0\.4\.0 installs after your attempt/).click();
	expect(await calls(page, "update_restart")).toHaveLength(0);
	await expect(page.getByText("CKPro 0.4.0 is ready to install")).toBeVisible();
	await expect(page.getByRole("button", { name: "Restart to update" })).toBeDisabled();
});

test("a download in the background shows how far it is, as Rust sends it", async ({ page }) => {
	await launch(page, "/");
	await emit(page, "update-changed", {
		...upToDate,
		status: { state: "downloading", version: "0.4.0", done: 40, total: 100 },
	});
	await expect(chip(page, /Downloading CKPro 0\.4\.0, 40%/)).toBeVisible();
	// Nothing to put away while it comes
	await expect(page.getByRole("button", { name: "Not now" })).toHaveCount(0);
});

test("a required update has no Not now, and no new attempt starts on this version", async ({
	page,
}) => {
	const first = { ...sample.plans[0], id: 901, day: "2026-11-02", done: null, mode: "practice" };
	await launch(page, "/", {
		update_state: updateReady({ required: true }),
		plans_between: [first],
		start_exam: {
			$error: {
				code: "update_required",
				message: "CKPro 0.4.0 is required to start an exam: restart to update.",
			},
		},
	});
	await expect(page.getByText("CKPro 0.4.0 is required to start an exam.")).toBeVisible();
	await expect(chip(page, /\(required\)/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Not now" })).toHaveCount(0);
	await page.getByRole("button", { name: "Start next" }).click();
	await expect(
		page.getByText("CKPro 0.4.0 is required to start an exam: restart to update.")
	).toBeVisible();
});

test("an update CKPro cannot install opens its release, with the command to run", async ({
	page,
}) => {
	await launch(page, "/", {
		update_state: {
			...upToDate,
			status: {
				state: "manual",
				version: "0.4.0",
				notes: "",
				required: false,
				reason: "This computer has no way to ask for your password (pkexec is missing)",
				url: "https://github.com/dungxtd/ckpro/releases/tag/v0.4.0",
				command: "sudo apt install ./ckpro_0.4.0_linux-x64.deb",
			},
		},
		open_in_browser: null,
	});
	await chip(page, /Download CKPro 0\.4\.0/).click();
	expect(await calls(page, "open_in_browser")).toEqual([
		{ url: "https://github.com/dungxtd/ckpro/releases/tag/v0.4.0" },
	]);
	await page.goto("/#/settings");
	await expect(page.getByText("sudo apt install ./ckpro_0.4.0_linux-x64.deb")).toBeVisible();
});

test("the first run on a new version says it once", async ({ page }) => {
	await launch(page, "/", { update_state: { ...upToDate, updated_from: "0.3.1" } });
	await expect(page.getByText("Updated to CKPro 0.3.2")).toBeVisible();
});

test("installing covers the window until CKPro starts again", async ({ page }) => {
	await launch(page, "/", { update_state: updateReady() });
	await emit(page, "update-changed", {
		...upToDate,
		status: { state: "restarting", version: "0.4.0" },
	});
	await expect(page.getByRole("status").getByText("Updating to CKPro 0.4.0")).toBeVisible();
});
