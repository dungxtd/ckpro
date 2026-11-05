/** A duration as a clock reads it: `m:ss` */
export function clock(ms: number) {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
