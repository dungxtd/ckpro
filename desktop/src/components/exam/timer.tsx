import { useEffect, useState } from "react";

const format = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** Time left in exam mode, time spent in practice mode. */
export function Timer({ startedAt, endsAt }: { startedAt: number; endsAt: number | null }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	if (endsAt === null)
		return <span className="font-mono tabular-nums">{format(now - startedAt)} elapsed</span>;
	const left = endsAt - now;
	return (
		<span className={`font-mono tabular-nums ${left < 10 * 60 * 1000 ? "text-red-500" : ""}`}>
			{format(left)} left
		</span>
	);
}
