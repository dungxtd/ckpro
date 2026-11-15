import { reducedMotion } from "@ckpro/ui/lib/motion";
import { useEffect, useState } from "react";

/**
 * A number counted up from 0 to `to` as it first shows, slowing at the end
 * (a score coming in), over `ms`; at once under reduced motion. Whole numbers
 */
export function useCountUp(to: number, ms = 800) {
	const [value, setValue] = useState(() => (reducedMotion() ? to : 0));
	useEffect(() => {
		if (reducedMotion()) {
			setValue(to);
			return;
		}
		let frame = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			setValue(Math.round(to * (1 - (1 - t) ** 3)));
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [to, ms]);
	return value;
}
