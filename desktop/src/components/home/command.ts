import type { ExamTarget } from "@/tauri/api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The command line Home's terminal starts with */
export const PROMPT = "kubectl set exam ";

/** What a line typed in Home's terminal does */
export type Command =
	| { kind: "set"; target: ExamTarget; output: string }
	| { kind: "delete"; output: string }
	| { kind: "none" }
	| { kind: "error"; output: string };

/** The full command for a target, as it would be typed */
export function commandFor(target: Pick<ExamTarget, "certification" | "date" | "rest_days">) {
	const rest = target.rest_days.map(i => DAYS[i]).join(",");
	return `${PROMPT}${target.certification} --date ${target.date}${rest ? ` --rest ${rest}` : ""}`;
}

/**
 * A line typed in Home's terminal, read as kubectl would:
 * `kubectl set exam <certification> [--date YYYY-MM-DD] [--rest sat,sun]`
 * sets the target (the date and rest days kept from the current one when
 * left out), `kubectl delete exam` removes it, `kubectl get exam` shows it
 */
export function runCommand(
	line: string,
	{
		certifications,
		current,
		today,
		defaultDate,
	}: {
		certifications: string[];
		current: ExamTarget | null;
		/** YYYY-MM-DD */
		today: string;
		/** The day a new target takes without --date */
		defaultDate: string;
	}
): Command {
	const words = line.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return { kind: "none" };
	if (words[0] !== "kubectl")
		return {
			kind: "error",
			output: `${words[0]}: command not found, try ${PROMPT}<certification>`,
		};
	const [verb, resource, ...rest] = words.slice(1);
	if (resource !== "exam" && resource !== "exams")
		return {
			kind: "error",
			output: `error: the server doesn't have a resource type "${resource ?? ""}"`,
		};
	if (verb === "get") return { kind: "none" };
	if (verb === "delete") {
		if (!current) return { kind: "error", output: "Error from server (NotFound): no exam set" };
		return { kind: "delete", output: `exam "${current.certification}" deleted` };
	}
	if (verb !== "set") return { kind: "error", output: `error: unknown command "${verb}"` };

	let certification: string | null = null;
	// A target's day gone by is no day to keep: set again, it moves to the default
	let date = current?.date && current.date > today ? current.date : defaultDate;
	let restDays = current?.rest_days ?? [];
	for (let i = 0; i < rest.length; i++) {
		const word = rest[i];
		const [flag, inline] = word.split("=", 2);
		const value = () => inline ?? rest[++i];
		if (flag === "--date") {
			const d = value();
			if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))
				return {
					kind: "error",
					output: `error: --date wants a day as YYYY-MM-DD, not "${d ?? ""}"`,
				};
			if (d <= today) return { kind: "error", output: `error: ${d} is not after today` };
			date = d;
		} else if (flag === "--rest") {
			const names = (value() ?? "").toLowerCase().split(",").filter(Boolean);
			const unknown = names.find(n => !DAYS.includes(n.slice(0, 3)));
			if (unknown)
				return { kind: "error", output: `error: --rest wants days like sat,sun, not "${unknown}"` };
			restDays = [...new Set(names.map(n => DAYS.indexOf(n.slice(0, 3))))].sort();
		} else if (word.startsWith("-")) {
			return { kind: "error", output: `error: unknown flag: ${word}` };
		} else if (certification) {
			return { kind: "error", output: `error: one exam at a time, not "${word}"` };
		} else {
			certification = word.toLowerCase();
		}
	}
	if (!certification)
		return { kind: "error", output: `error: which exam? ${certifications.join(", ")}` };
	if (!certifications.includes(certification))
		return {
			kind: "error",
			output: `error: no exam "${certification}", try ${certifications.join(", ")}`,
		};
	return {
		kind: "set",
		target: {
			certification,
			date,
			rest_days: restDays,
			// The preparation keeps its first day while the target changes
			started: current?.started ?? today,
		},
		output: `exam "${certification}" ${current ? "configured" : "created"}`,
	};
}
