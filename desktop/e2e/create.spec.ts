import { expect, type Page, test } from "@playwright/test";
import { calls, emit, emptyDraft, launch, reply } from "./backend";

const item = (id: string, title: string, state = "linted") => ({
	kind: "existing",
	id,
	title,
	domain: "troubleshooting",
	minutes: 8,
	disrupts: false,
	status: { state },
});
const draft = (
	title: string,
	items = [
		item("core/cka/a", "Fix a Deployment"),
		item("core/cka/b", "Troubleshooting Application"),
	]
) => ({
	...emptyDraft,
	title,
	certification: "cka",
	duration_minutes: 60,
	domains: [{ domain: "troubleshooting", weight: 30 }],
	items,
});
const conversation = (id: number, title: string) => ({
	id,
	messages: [
		{ role: "user", text: `Build ${title}`, tools: [] },
		{ role: "assistant", text: `Here is ${title}.`, tools: [] },
	],
	draft: draft(title),
});
const sessions = [
	{ id: 1, title: "Warm-up", updated_at: 2 },
	{ id: 2, title: "Weak spots", updated_at: 1 },
];
const plan = {
	workers: 1,
	mb: 2124,
	changed: 2,
	total: 2,
	minutes_all: 3,
	minutes_changed: 3,
	problem: null,
	missing: [],
};

async function openCreate(page: Page, replies = {}) {
	await launch(page, "/create", {
		studio_sessions: sessions,
		studio_open: conversation(1, "Warm-up"),
		studio_plan: plan,
		...replies,
	});
	await expect(page.getByText("Here is Warm-up.")).toBeVisible();
}

test("the draft's lines meet the conversation's", async ({ page }) => {
	await openCreate(page);
	const chatHeader = await page.locator("header", { hasText: "Warm-up" }).first().boundingBox();
	const summary = await page
		.getByRole("heading", { name: "Warm-up", exact: true })
		.locator("xpath=ancestor::div[contains(@class,'h-14')][1]")
		.boundingBox();
	if (!chatHeader || !summary) throw new Error("both are on screen");
	// Their bottom borders are one line across the window
	expect(
		Math.abs(chatHeader.y + chatHeader.height - (summary.y + summary.height))
	).toBeLessThanOrEqual(1);
});

test("the conversation asked for last is the one shown, however the answers come", async ({
	page,
}) => {
	await openCreate(page);
	// Weak spots answers slowly; Warm-up, asked after, at once
	await reply(page, "studio_open", { $after: 600, value: conversation(2, "Weak spots") });
	await page.getByRole("button", { name: "Earlier conversations" }).click();
	await page.getByRole("button", { name: "Weak spots", exact: true }).click();
	await reply(page, "studio_open", conversation(1, "Warm-up"));
	await page.getByRole("button", { name: "Earlier conversations" }).click();
	await page.getByRole("button", { name: "Warm-up", exact: true }).click();
	await page.waitForTimeout(900);
	await expect(page.getByText("Here is Warm-up.")).toBeVisible();
	await expect(page.getByText("Here is Weak spots.")).toBeHidden();
});

test("a proof shows its steps as Rust reports them, and Stop stops it", async ({ page }) => {
	await openCreate(page);
	await reply(page, "studio_verify", { $after: 60_000, value: null });
	await page.getByRole("button", { name: "Prove & save" }).click();
	const proof = (stage: unknown, results: unknown[] = []) => ({
		session: 1,
		proof: {
			activity: 7,
			started_at: Date.now(),
			checking: ["core/cka/a", "core/cka/b"],
			stage,
			results,
			marks: [Date.now()],
			ended_at: null,
			stopped: false,
		},
	});
	await emit(page, "studio-proof", proof({ stage: "cluster", workers: 1 }));
	await expect(page.getByText("Making a cluster with 1 worker")).toBeVisible();
	await emit(
		page,
		"studio-proof",
		proof({ stage: "proving", key: "core/cka/b", since: Date.now() }, [
			{ key: "core/cka/a", status: { state: "proven" } },
		])
	);
	await expect(page.getByText("Question 2 of 2")).toBeVisible();
	await expect(page.getByRole("radio", { name: /Proof/ })).toContainText("1/2");
	await page.getByRole("button", { name: "Stop" }).click();
	expect(await calls(page, "studio_stop_proof")).toEqual([{ session: 1 }]);
});

test("deleting a conversation asks first", async ({ page }) => {
	await openCreate(page);
	await reply(page, "studio_delete", null);
	await page.getByRole("button", { name: "Earlier conversations" }).click();
	await page.getByRole("button", { name: "Delete Weak spots" }).click();
	await expect(page.getByRole("alertdialog")).toContainText("Delete Weak spots?");
	expect(await calls(page, "studio_delete")).toEqual([]);
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	expect(await calls(page, "studio_delete")).toEqual([{ session: 2 }]);
});

test("a draft that cannot be proven says why and keeps the button off", async ({ page }) => {
	await openCreate(page, {
		studio_plan: {
			...plan,
			problem: "Proving the exam needs at least 2.1 GB of memory; Docker has 1.4 GB free.",
		},
	});
	await expect(page.getByText(/needs at least 2.1 GB/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Prove & save" })).toBeDisabled();
});

test("on a narrow window the draft is a panel dragged up and down", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 760 });
	await openCreate(page);
	const handle = page.getByRole("separator", { name: "Resize the exam" });
	const question = page.getByText("Fix a Deployment");
	await expect(question).toBeVisible();
	// Dragged down to the bottom: only its head and foot are left
	const box = await handle.boundingBox();
	if (!box) throw new Error("the handle is on screen");
	await page.mouse.move(box.x + box.width / 2, box.y + 4);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, 755, { steps: 8 });
	await page.mouse.up();
	await expect(question).toBeHidden();
	await expect(page.getByRole("button", { name: "Prove & save" })).toBeVisible();
	// And open again from the keyboard
	await handle.focus();
	await page.keyboard.press("Enter");
	await expect(question).toBeVisible();
});

test("Cmd+F finds in the conversation, and an answer copies or goes to its question", async ({
	page,
}) => {
	await openCreate(page);
	// The chat holds the pointer: the shortcut opens find there
	await page.getByText("Here is Warm-up.").hover();
	await page.keyboard.press("ControlOrMeta+f");
	const find = page.getByRole("searchbox", { name: "Find in this session" });
	await expect(find).toBeFocused();
	await find.fill("warm-up");
	await expect(page.getByText("1 of 2")).toBeVisible();
	await find.press("Enter");
	await expect(page.getByText("2 of 2")).toBeVisible();
	await find.press("Escape");
	await expect(find).toBeHidden();
	// An answer's own actions show on pointing at it
	await page.getByText("Here is Warm-up.").hover();
	await expect(page.getByRole("button", { name: "Copy this answer" })).toBeVisible();
	await page.getByRole("button", { name: "Go to the question" }).click();
	await expect(page.getByText("Build Warm-up")).toBeInViewport();
});
