import { calls, emit, launch, withSettings } from "./backend";
import { expect, test } from "./fixture";

/** An attempt of the sample's first exam: two questions on one cluster */
const attempt = (mode: "exam" | "practice") => ({
	id: "a1",
	exam_id: "cka-001",
	title: "CKA Practice Lab - Core Concepts",
	certification: "cka",
	mode,
	pass_score: 66,
	clusters: ["k8s"],
	questions: [
		{
			id: "core/cka/q1",
			title: "Create a namespace",
			cluster: "k8s",
			host: "k8s",
			namespace: "team-a",
			tags: ["namespaces"],
			weight: 60,
			statement: "Create the namespace `team-a`.",
			hints: mode === "practice" ? ["Use kubectl create"] : [],
			references: [],
		},
		{
			id: "core/cka/q2",
			title: "Scale a Deployment",
			cluster: "k8s",
			host: "k8s",
			namespace: null,
			tags: [],
			weight: 40,
			statement: "Scale the Deployment web to 3 replicas.",
			hints: [],
			references: [],
		},
	],
});
const startedAt = Date.parse("2026-11-02T09:50:00Z");
const running = (mode: "exam" | "practice") => ({
	phase: "running",
	attempt: attempt(mode),
	started_at: startedAt,
	ends_at: mode === "exam" ? startedAt + 2 * 3600_000 : null,
});
const desk = {
	exam_progress: { current: 0, flagged: [], hints_shown: {} },
	save_exam_progress: null,
	desktop_session: null,
};

test("the exam is timed, has no hints, checks or assistant, and End Exam grades it", async ({
	page,
}) => {
	await launch(page, "/exam", { ...desk, exam_state: running("exam"), submit_exam: null });
	await expect(page.getByText("Create the namespace team-a.")).toBeVisible();
	// Two hours from 09:50, ten minutes in
	await expect(page.getByText("01:50:00")).toBeVisible();
	await expect(page.getByText("Question 1 of 2")).toBeVisible();
	for (const name of ["Check my work", "Hint 1/1", "Quit", "Show assistant"])
		await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
	await expect(page.getByRole("radio", { name: "Solution" })).toHaveCount(0);

	await page.getByRole("button", { name: "End Exam" }).click();
	await expect(page.getByRole("alertdialog", { name: "End the exam?" })).toBeVisible();
	// Keep Working changes nothing
	await page.getByRole("button", { name: "Keep Working" }).click();
	expect(await calls(page, "submit_exam")).toHaveLength(0);
	await page.getByRole("button", { name: "End Exam" }).click();
	await page.getByRole("button", { name: "End exam" }).click();
	expect(await calls(page, "submit_exam")).toHaveLength(1);
});

test("moving between questions and flagging one is kept for the attempt", async ({ page }) => {
	await launch(page, "/exam", { ...desk, exam_state: running("exam") });
	await page.getByRole("button", { name: "Next question" }).click();
	await expect(page.getByText("Question 2 of 2")).toBeVisible();
	await expect(page.getByText("Scale the Deployment web to 3 replicas.")).toBeVisible();
	await page.getByRole("button", { name: "Flag for review" }).click();
	await expect
		.poll(() => calls(page, "save_exam_progress"))
		.toContainEqual({
			attemptId: "a1",
			progress: { current: 1, flagged: ["core/cka/q2"], hints_shown: {} },
		});
	await page.getByRole("button", { name: "Previous question" }).click();
	await expect(page.getByText("Question 1 of 2")).toBeVisible();
});

test("the app reopened mid-attempt goes back to the question the candidate was on", async ({
	page,
}) => {
	await launch(page, "/exam", {
		...desk,
		exam_state: running("exam"),
		exam_progress: { current: 1, flagged: [], hints_shown: {} },
	});
	await expect(page.getByText("Question 2 of 2")).toBeVisible();
	await expect(page.getByText("Scale the Deployment web to 3 replicas.")).toBeVisible();
});

test("practice checks the work, shows hints and the solution, and Quit leaves ungraded", async ({
	page,
}) => {
	await launch(page, "/exam", {
		...desk,
		exam_state: running("practice"),
		check_question: [
			{ name: "the namespace exists", weight: 2, passed: true, detail: "" },
			{ name: "it is labelled", weight: 1, passed: false, detail: "expected 'a', got ''" },
		],
		question_solution: {
			run: "kubectl create namespace team-a\n",
			explain: "Namespaces group resources.",
		},
		end_exam: null,
	});
	// No time limit: the clock counts up
	await expect(page.getByText("00:10:00")).toBeVisible();

	await page.getByRole("button", { name: "Check my work" }).click();
	expect(await calls(page, "check_question")).toEqual([{ questionId: "core/cka/q1" }]);
	await expect(page.getByText("the namespace exists")).toBeVisible();
	await expect(page.getByText("expected 'a', got ''")).toBeVisible();

	await page.getByRole("button", { name: "Hint 1/1" }).click();
	await expect(page.getByText("Use kubectl create")).toBeVisible();

	// Opened on purpose: the assistant is told it was seen
	await page.getByRole("radio", { name: "Solution" }).click();
	expect(await calls(page, "question_solution")).toHaveLength(0);
	await page.getByRole("button", { name: "Show solution" }).click();
	expect(await calls(page, "question_solution")).toEqual([{ questionId: "core/cka/q1" }]);
	await expect(page.getByText("Namespaces group resources.")).toBeVisible();
	await expect(page.getByText("kubectl create namespace team-a")).toBeVisible();

	await page.getByRole("button", { name: "Quit" }).click();
	await expect(page.getByRole("alertdialog", { name: "Quit the practice?" })).toBeVisible();
	await page.getByRole("alertdialog").getByRole("button", { name: "Quit" }).click();
	expect(await calls(page, "end_exam")).toHaveLength(1);
	expect(await calls(page, "submit_exam")).toHaveLength(0);
});

test("a check that fails to run says why and can be run again", async ({ page }) => {
	await launch(page, "/exam", {
		...desk,
		exam_state: running("practice"),
		check_question: { $error: { code: "not_found", message: "k8s-control-plane is not running" } },
	});
	await page.getByRole("button", { name: "Check my work" }).click();
	await expect(page.getByText("k8s-control-plane is not running")).toBeVisible();
	await expect(page.getByRole("button", { name: "Check my work" })).toBeEnabled();
});

test("preparing shows its steps as Rust reports them, and Cancel stops it", async ({ page }) => {
	const activity = {
		id: 7,
		title: "Setting up CKA Practice Lab - Core Concepts",
		steps: [
			"Preparing images and the registry cache",
			"Creating cluster k8s: 1 control plane, 1 worker",
		],
		current: 1,
		detail: null,
		status: "running",
		error: null,
		started_at: Date.parse("2026-11-02T09:58:00Z"),
		ended_at: null,
		log: [],
	};
	await launch(page, "/exam", {
		exam_state: { phase: "preparing", attempt: attempt("exam"), activity: 7 },
		activities: [activity],
		end_exam: null,
	});
	await expect(page.getByText("Creating cluster k8s: 1 control plane, 1 worker")).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	expect(await calls(page, "end_exam")).toHaveLength(1);
	// Rust says it is ready: the desk opens
	await emit(page, "exam-changed", running("exam"));
	await expect(page.getByText("Create the namespace team-a.")).toBeVisible();
});

const result = {
	score: 60,
	passed: false,
	started_at: startedAt,
	finished_at: startedAt + 25 * 60_000,
	outside: ["ckpro-desktop was paused outside ckpro: resumed"],
	assisted: [],
	questions: [
		{
			id: "core/cka/q1",
			title: "Create a namespace",
			points: 2,
			max_points: 2,
			checks: [{ name: "the namespace exists", weight: 2, passed: true, detail: "" }],
		},
		{
			id: "core/cka/q2",
			title: "Scale a Deployment",
			points: 0,
			max_points: 1,
			checks: [
				{ name: "web has 3 replicas", weight: 1, passed: false, detail: "expected '3', got '1'" },
			],
		},
	],
};

test("the result shows the score, what changed outside, each check, and closing cleans up", async ({
	page,
}) => {
	await launch(page, "/exam", {
		exam_state: { phase: "finished", attempt: attempt("exam"), result },
		end_exam: null,
	});
	await expect(page.getByText("60%")).toBeVisible();
	await expect(page.getByText("Failed", { exact: true })).toBeVisible();
	await expect(page.getByText(/pass line 66%/)).toBeVisible();
	await expect(page.getByText("ckpro-desktop was paused outside ckpro: resumed")).toBeVisible();

	// The questions are listed: one opened shows its checks
	await page.getByRole("button", { name: /Scale a Deployment/ }).click();
	await expect(page.getByText("web has 3 replicas")).toBeVisible();
	await expect(page.getByText("expected '3', got '1'")).toBeVisible();

	await page.getByRole("button", { name: "Close exam", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Close Exam" }).click();
	expect(await calls(page, "end_exam")).toHaveLength(1);
	await emit(page, "exam-changed", { phase: "idle" });
	await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});

test("the result with no exam aimed at asks for the plans once, not on every render", async ({
	page,
}) => {
	await launch(page, "/exam", {
		settings: withSettings({ targets: [] }),
		exam_state: { phase: "finished", attempt: attempt("exam"), result },
	});
	await expect(page.getByText("60%")).toBeVisible();
	await page.waitForTimeout(500);
	expect((await calls(page, "plans_between")).length).toBeLessThanOrEqual(2);
});

test("a resume that failed keeps the attempt: Try again resumes it", async ({ page }) => {
	await launch(page, "/exam", {
		exam_state: {
			phase: "failed",
			attempt: attempt("exam"),
			message: "cluster k8s did not come back within 2 minutes",
			activity: null,
			resumable: true,
		},
		retry_exam: null,
	});
	await expect(page.getByText("cluster k8s did not come back within 2 minutes")).toBeVisible();
	await page.getByRole("button", { name: "Try again" }).click();
	expect(await calls(page, "retry_exam")).toHaveLength(1);
	expect(await calls(page, "start_exam")).toHaveLength(0);
});

test("ending an attempt that cannot end yet says why on the result", async ({ page }) => {
	await launch(page, "/exam", {
		exam_state: { phase: "finished", attempt: attempt("exam"), result },
		end_exam: {
			$error: { code: "invalid", message: "wait for the exam to finish what it is doing" },
		},
	});
	await page.getByRole("button", { name: "Close exam", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Close Exam" }).click();
	await expect(page.getByText("wait for the exam to finish what it is doing")).toBeVisible();
});

test("a move made before the saved place is read back is kept", async ({ page }) => {
	await launch(page, "/exam", {
		exam_state: running("exam"),
		// The saved place comes back late, after the candidate moved on
		exam_progress: { $after: 1500, value: { current: 0, flagged: [], hints_shown: {} } },
	});
	await page.getByRole("button", { name: "Next question" }).click();
	await expect(page.getByText("Question 2 of 2")).toBeVisible();
	await page.waitForTimeout(2000);
	await expect(page.getByText("Question 2 of 2")).toBeVisible();
});

test("a preparation that failed starts over as a new attempt of the exam", async ({ page }) => {
	await launch(page, "/exam", {
		exam_state: {
			phase: "failed",
			attempt: attempt("practice"),
			message: "setup of core/cka/q1 failed",
			activity: null,
			resumable: false,
		},
		end_exam: null,
		start_exam: null,
	});
	await page.getByRole("button", { name: "Start Over" }).click();
	await expect
		.poll(() => calls(page, "start_exam"))
		.toEqual([{ id: "cka-001", mode: "practice", replace: true }]);
	expect(await calls(page, "end_exam")).toHaveLength(1);
});
