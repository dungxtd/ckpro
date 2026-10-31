import { describe, expect, it } from "vitest";
import type { ExamSummary } from "@/tauri/api";
import { byCertification, memoryFit, shortTitle } from "./exams";

const exam = (id: string, certification: string, title = id): ExamSummary => ({
	id,
	title,
	description: "",
	certification,
	questions: 10,
	duration_minutes: 60,
	pass_score: 66,
	memory_mb: 4096,
	minimum_mb: 3072,
	nodes: 2,
	clusters: ["k8s"],
});

describe("exams", () => {
	it("groups by certification in the order they are taken", () => {
		const groups = byCertification([
			exam("s", "cks"),
			exam("a", "cka"),
			exam("d", "ckad"),
			exam("b", "cka"),
		]);
		expect(groups.map(([cert, exams]) => [cert, exams.map(e => e.id)])).toEqual([
			["cka", ["a", "b"]],
			["ckad", ["d"]],
			["cks", ["s"]],
		]);
	});

	it("says how an exam fits Docker's memory", () => {
		const e = exam("a", "cka");
		expect(memoryFit(e, null)).toBe("unknown");
		expect(memoryFit(e, 2048)).toBe("too-small");
		expect(memoryFit(e, 3500)).toBe("slower");
		expect(memoryFit(e, 8192)).toBe("fits");
	});

	it("drops what the certification's heading already says", () => {
		expect(shortTitle(exam("a", "cka", "CKA Practice Lab - Core Concepts"))).toBe("Core Concepts");
		expect(shortTitle(exam("d", "ckad", "CKAD Comprehensive Lab - 1"))).toBe(
			"Comprehensive Lab - 1"
		);
		expect(shortTitle(exam("h", "cka", "Helm Fundamentals Lab"))).toBe("Helm Fundamentals Lab");
	});
});
