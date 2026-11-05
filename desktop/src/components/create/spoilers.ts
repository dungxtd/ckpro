/** A question's top-level keys that give its answer away */
const SPOILERS = ["solution", "hints"];

/**
 * A question's YAML without what gives its answer away (its `solution` and
 * `hints` blocks, by their top-level keys), and whether there was any
 */
export function withoutSpoilers(yaml: string): { shown: string; hidden: boolean } {
	const kept: string[] = [];
	let skipping = false;
	let hidden = false;
	for (const line of yaml.split("\n")) {
		const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
		if (key !== undefined) skipping = SPOILERS.includes(key);
		if (skipping) hidden = true;
		else kept.push(line);
	}
	return { shown: kept.join("\n").trimEnd(), hidden };
}
