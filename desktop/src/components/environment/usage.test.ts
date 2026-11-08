import { describe, expect, it } from "vitest";
import type { ContainerUse } from "@/tauri/bindings";
import { otherApps, parts, purpose, serviceName } from "./usage";

const use = (name: string, mb: number, owner: ContainerUse["owner"]): ContainerUse => ({
	name,
	mb,
	owner,
});

describe("the memory map", () => {
	const usage = [
		use("k8s-control-plane", 600, { kind: "cluster", cluster: "k8s" }),
		use("k8s-worker", 400, { kind: "cluster", cluster: "k8s" }),
		use("k8s-v641f-control-plane", 500, { kind: "cluster", cluster: "k8s-v641f" }),
		use("cktry-mirror", 50, { kind: "service", service: "cktry-mirror" }),
		use("cktry-jumphost", 10, { kind: "service", service: "cktry-jumphost" }),
		use("dev-control-plane", 700, { kind: "other", cluster: "dev" }),
		use("postgres", 300, { kind: "other", cluster: null }),
	];

	it("tells the exam's clusters from a proof's", () => {
		expect(purpose("k8s", ["k8s"])).toBe("exam");
		expect(purpose("k8s-v641f", ["k8s"])).toBe("proof");
		expect(purpose("k8s", [])).toBe("other");
	});

	it("adds the memory up by cluster, services and other apps", () => {
		expect(parts(usage, ["k8s"]).map(p => [p.key, p.mb, p.kind])).toEqual([
			["k8s", 1000, "exam"],
			["k8s-v641f", 500, "proof"],
			["services", 60, "services"],
			["others", 1000, "others"],
		]);
	});

	it("keeps a cluster of the app whose nodes are all stopped", () => {
		expect(parts([], [], ["k8s"]).map(p => [p.key, p.mb])).toEqual([["k8s", 0]]);
	});

	it("names the services and counts a kind cluster of other apps as one", () => {
		expect(serviceName("cktry-jumphost-a634")).toBe("Task host of a proof");
		expect(serviceName("cktry-mirror")).toBe("Image mirror");
		expect(otherApps(usage)).toEqual([
			{ name: "dev", what: "kind cluster", mb: 700 },
			{ name: "postgres", what: "container", mb: 300 },
		]);
	});
});
