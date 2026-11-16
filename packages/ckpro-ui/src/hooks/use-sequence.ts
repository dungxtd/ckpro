import { useEffect } from "react";

/** What a sequence's steps are made of: an animation played to its end, or
 * a wait. Once the sequence is cancelled they never settle: what awaits
 * them stops there, and nothing is thrown */
export interface Sequence {
	/** `el.animate`, kept at its end (`fill: forwards` unless said); resolves
	 * when it ends */
	play: (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => Promise<void>;
	wait: (ms: number) => Promise<void>;
}

/** A promise that never settles: where a cancelled sequence stops */
const never = () => new Promise<never>(() => {});

/**
 * Steps in time, run once `when` turns true: each `await`s the last (an
 * animation's end, a wait). All stop and are cancelled when the component
 * goes, or `when` turns false (React's second run in development
 * included): an animation not awaited stops too, and nothing is thrown
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
				new Promise(done => {
					timers.push(window.setTimeout(() => live && done(), ms));
				}),
			play: (el, frames, options) => {
				const a = el.animate(frames, { fill: "forwards", ...options });
				playing.push(a);
				// Cancelled as it goes (it rejects then): left pending, not an error
				return a.finished.then(
					() => (live ? undefined : never()),
					() => never()
				);
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
