import { expect, test } from "@playwright/test";
import { calls, emit, launch } from "./backend";

const node = (name: string, role: string, running = true) => ({
	name,
	role,
	container: running ? { state: "running" } : { state: "stopped" },
	ready: running ? { state: "ready" } : { state: "unknown" },
});
const up = { state: "up", engine: "OrbStack", version: "28", cpus: 8, memory_mb: 5939 };

test("the clusters show live; one is deleted only once confirmed", async ({ page }) => {
	await launch(page, "/environment", { delete_cluster: null, env_watch_nodes: null });
	await expect(page.getByText("No clusters: an exam makes the ones it needs")).toBeVisible();
	expect(await calls(page, "env_watch_nodes")).toContainEqual({ on: true });
	await emit(page, "env-changed", {
		docker: up,
		clusters: [
			{
				name: "k8s",
				nodes: [node("k8s-control-plane", "control_plane"), node("k8s-worker", "worker")],
			},
		],
		issues: [],
	});
	await expect(page.getByText("k8s-control-plane")).toBeVisible();
	await expect(page.getByText("1 control plane, 1 worker", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Delete" }).click();
	await expect(page.getByRole("alertdialog", { name: "Delete k8s?" })).toBeVisible();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await expect.poll(() => calls(page, "delete_cluster")).toEqual([{ name: "k8s" }]);
});

test("a cluster with a stopped node offers Repair", async ({ page }) => {
	await launch(page, "/environment", {
		repair_cluster: null,
		env_state: {
			docker: up,
			clusters: [
				{
					name: "k8s",
					nodes: [node("k8s-control-plane", "control_plane"), node("k8s-worker", "worker", false)],
				},
			],
			issues: [],
		},
	});
	await page.getByRole("button", { name: "Repair" }).click();
	await expect.poll(() => calls(page, "repair_cluster")).toEqual([{ name: "k8s" }]);
});

test("Docker down says so, and Retry now asks again", async ({ page }) => {
	await launch(page, "/environment", {
		env_retry: null,
		env_state: { docker: { state: "down", reason: "no engine answers" }, clusters: [], issues: [] },
	});
	await expect(page.getByText("Docker down")).toBeVisible();
	await page.getByRole("button", { name: "Retry now" }).click();
	expect(await calls(page, "env_retry")).toHaveLength(1);
	await emit(page, "env-changed", { docker: up, clusters: [], issues: [] });
	await expect(page.getByText("Docker 28, 8 CPUs, 5.8 GB")).toBeVisible();
});
