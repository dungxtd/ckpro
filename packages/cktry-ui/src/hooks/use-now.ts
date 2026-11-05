import { useEffect, useState } from "react";

/**
 * The time now, ticking every `every` ms while `on` (a clock shown while
 * something runs): read again the moment it turns on
 */
export function useNow(on = true, every = 1000) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!on) return;
		setNow(Date.now());
		const tick = setInterval(() => setNow(Date.now()), every);
		return () => clearInterval(tick);
	}, [on, every]);
	return now;
}
