import { useEffect } from "react";

/** What a sequence's steps are made of: an animation played to its end, or
 * a wait. Both stop the sequence once it is cancelled */
export interface Sequence {
	/** `el.animate`, kept at its end (`fill: forwards` unless said); resolves
	 * when it ends */
	play: (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => Promise<void>;
	wait: (ms: number) => Promise<void>;
}

/**
 * Steps in time, run once `when` turns true: each `await`s the last (an
 * animation's end, a wait). All stop and are cancelled when the component
 * goes, or `when` turns false (React's second run in development
 * included): an animation not awaited stops too, without an error
 */
export function useSequence(run: (s: Sequence) => Promise<void>, when = true) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: once, as `when` turns true
	useEffect(() => {
		if (!when) return;
		const playing: Animation[] = [];
		const timers: number[] = [];
		let live = true;
		const steps: Sequence = {
			wait: ms =>
				new Promise((done, stop) => {
					timers.push(window.setTimeout(() => (live ? done() : stop()), ms));
				}),
			play: (el, frames, options) => {
				const a = el.animate(frames, { fill: "forwards", ...options });
				playing.push(a);
				const done = a.finished.then(() => {
					if (!live) throw new Error("stopped");
				});
				// Cancelled as it goes: not an error, whether awaited or not
				done.catch(() => {});
				return done;
			},
		};
		run(steps).catch(() => {});
		return () => {
			live = false;
			for (const t of timers) clearTimeout(t);
			for (const a of playing) a.cancel();
		};
	}, [when]);
}
