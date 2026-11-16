import { Button } from "@ckpro/ui/components/button";
import { Terminal } from "@ckpro/ui/components/terminal";
import { usePageVisible } from "@ckpro/ui/hooks/use-page-visible";
import { useSequence } from "@ckpro/ui/hooks/use-sequence";
import { easeGlide } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "./app-icon";

/** The command typed, then the flags rolling past onto the one it means */
const COMMAND = "kubectl apply -f exam.yaml";
const FLAGS = [
	"namespace=exam",
	"watch",
	"output=yaml",
	"all-namespaces",
	"selector=app=web",
	"force",
	"record",
	"dry-run=client",
];
const HELLO = "Welcome to CKPro.";

/** The kit's strong ease-out, and an overshoot for what pops into place */
const OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/** The whole greeting a little brisker than its parts are written */
const t = (seconds: number) => (seconds * 1000) / 1.15;

/**
 * The first launch's greeting: the app icon puts itself together in the
 * middle of the window and rises; a command is typed, the icon's two
 * dashes drop out of it into the command as its `--`, the flags roll onto
 * `dry-run=client`, it runs, and the window says hello. Then Get started
 * (`onNext`, Enter too). Under reduced motion, or `still`, all of it is
 * there at once
 */
export function Greeting({ still, onNext }: { still: boolean; onNext: () => void }) {
	// Played only while the window is seen; hidden midway (timers slow down
	// there, out of step with the animations), it is shown as it ends
	const [cut, setCut] = useState(false);
	return (
		<Played
			key={cut ? "still" : "played"}
			still={still || cut}
			onCut={() => setCut(true)}
			onNext={onNext}
		/>
	);
}

function Played({
	still,
	onCut,
	onNext,
}: {
	still: boolean;
	onCut: () => void;
	onNext: () => void;
}) {
	const visible = usePageVisible();
	const playing = useRef(false);
	useEffect(() => {
		if (!visible && playing.current) onCut();
	}, [visible, onCut]);
	const box = useRef<HTMLDivElement>(null);
	const icon = useRef<SVGSVGElement>(null);
	const [done, setDone] = useState(still);
	// Ready once played: focused, so Enter goes on as its line says
	const go = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (done) go.current?.focus();
	}, [done]);

	// Played while the window is seen; played through, it stays as it ends
	// (`done` keeps the sequence on: a window hidden and shown again does
	// not cancel it, nor play it again)
	useSequence(
		async ({ play, wait }) => {
			const [b, svg] = [box.current, icon.current];
			if (!b || !svg) return;
			playing.current = true;
			const part = (name: string) => [...svg.querySelectorAll<SVGElement>(`[data-part="${name}"]`)];
			const one = (name: string) => part(name)[0] as SVGElement;
			const el = (name: string) =>
				b.querySelector<HTMLElement>(`[data-g="${name}"]`) as HTMLElement;
			// Each moving part of the icon turns about its own point on the grid
			for (const p of svg.querySelectorAll<SVGElement>("[data-part]"))
				p.style.transformBox = "view-box";
			const at = (els: SVGElement[], origin: string) => {
				for (const e of els) e.style.transformOrigin = origin;
			};
			at(part("tile"), "512px 512px");
			at(part("hept"), "500px 490px");
			at([...part("helm"), ...part("hub")], "500px 492px");

			// Where everything starts: held there (fill: both) until its turn
			const from = (els: Element[], frames: Keyframe[], ms: number, delay: number, easing = OUT) =>
				Promise.all(els.map(e => play(e, frames, { duration: ms, delay, easing, fill: "both" })));
			const iconBox = svg.getBoundingClientRect();
			const area = b.getBoundingClientRect();
			const middle = area.top + area.height / 2 - (iconBox.top + iconBox.height / 2);

			// 1. The icon comes together in the middle, then rises to its place
			from([svg], [{ translate: `0 ${middle}px` }, { translate: `0 ${middle}px` }], 1, 0);
			from(
				part("tile"),
				[
					{ opacity: 0, scale: 0.55 },
					{ opacity: 1, scale: 1 },
				],
				t(0.7),
				0,
				BACK
			);
			for (const [i, w] of part("wash").entries())
				from([w], [{ opacity: 0 }, { opacity: 1 }], t(0.7), t(0.15 + i * 0.1));
			from(
				part("hept"),
				[
					{ scale: 0, rotate: "-100deg" },
					{ scale: 1, rotate: "0deg" },
				],
				t(0.75),
				t(0.15),
				BACK
			);
			const ring = 2 * Math.PI * 150;
			from(
				part("ring"),
				[
					{ strokeDasharray: `${ring}`, strokeDashoffset: `${ring}`, opacity: 0 },
					{ strokeDasharray: `${ring}`, strokeDashoffset: "0", opacity: 1 },
				],
				t(0.55),
				t(0.65),
				easeGlide
			);
			part("spoke").forEach((s, i) => {
				const length = (s as SVGLineElement).getTotalLength();
				from(
					[s],
					[
						{ strokeDasharray: `${length}`, strokeDashoffset: `${length}`, opacity: 0 },
						{ strokeDasharray: `${length}`, strokeDashoffset: "0", opacity: 1 },
					],
					t(0.3),
					t(0.9 + i * 0.05)
				);
			});
			from(part("hub"), [{ scale: 0 }, { scale: 1 }], t(0.35), t(1.25), BACK);
			// One turn of the wheel: a seventh, so it lands as it was
			play(one("helm"), [{ rotate: "0deg" }, { rotate: `${360 / 7}deg` }], {
				duration: t(0.8),
				delay: t(1.45),
				easing: easeGlide,
				fill: "none",
			});
			// The prompt slides in, its cut-out with it, then blinks like a cursor
			for (const [i, p] of [...part("pill")].reverse().entries())
				from(
					[p],
					[
						{ opacity: 0, translate: "90px 0" },
						{ opacity: 1, translate: "0 0" },
					],
					t(0.45),
					t(1.75 + i * 0.08)
				);
			for (const [i, c] of [...part("cut")].reverse().entries())
				from(
					[c],
					[
						{ opacity: 0, translate: "90px 0" },
						{ opacity: 1, translate: "0 0" },
					],
					t(0.45),
					t(1.75 + i * 0.08)
				);
			const prompt = one("prompt");
			play(
				prompt,
				[1, 0.15, 1, 0.15, 1, 0.15, 1].map(opacity => ({ opacity, easing: "steps(1)" })),
				{ duration: t(0.84), delay: t(2.3), fill: "none" }
			);
			play(svg, [{ translate: `0 ${middle}px` }, { translate: "0 0" }], {
				duration: t(0.8),
				delay: t(3),
				easing: easeGlide,
				fill: "both",
			});

			// 2. The command, typed
			const term = el("term");
			from(
				[term],
				[
					{ opacity: 0, translate: "0 16px" },
					{ opacity: 1, translate: "0 0" },
				],
				t(0.5),
				t(3.3)
			);
			const typed = el("cmd");
			const typing = from(
				[typed],
				[{ width: "0ch" }, { width: `${COMMAND.length}ch` }],
				t(COMMAND.length * 0.04),
				t(3.9),
				`steps(${COMMAND.length})`
			);
			const slot = el("slot");
			const roll = el("roll");
			const out = el("out");
			const hello = [...b.querySelectorAll<HTMLElement>("[data-g='char']")];
			const sub = el("sub");
			for (const e of [slot, roll, out, sub, ...hello]) e.style.opacity = "0";
			slot.style.display = "none";
			roll.style.display = "none";
			// Everything is where it starts: now it may be seen
			b.style.visibility = "";
			// The command typed to its end before the dashes are aimed at it: a
			// wait would end a frame early, the line one character short
			await typing;

			// 3. The icon's two dashes drop out of it and land as the flag's "--"
			slot.style.display = "";
			slot.style.opacity = "1";
			const pills = part("pill").map(p => p.getBoundingClientRect());
			const chars = [...slot.children] as HTMLElement[];
			for (const c of chars) c.style.opacity = "0";
			play(prompt, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 200 });
			const flights = chars.map((ch, i) => {
				const a = pills[i] as DOMRect;
				const c = ch.getBoundingClientRect();
				const fly = document.createElement("div");
				fly.className = "greet-fly";
				b.appendChild(fly);
				const w = c.width * 0.72;
				const x = c.left - area.left + (c.width - w) / 2;
				const y = c.top - area.top + c.height / 2 - 1;
				return play(
					fly,
					[
						{
							left: `${a.left - area.left}px`,
							top: `${a.top - area.top}px`,
							width: `${a.width}px`,
							height: `${a.height}px`,
						},
						{ offset: 0.5, translate: "0 -18px" },
						{ left: `${x}px`, top: `${y}px`, width: `${w}px`, height: "2px", translate: "0 0" },
					],
					{ duration: t(0.75), delay: t(i * 0.07), easing: easeGlide }
				).then(async () => {
					await Promise.all([
						play(fly, [{ opacity: 1 }, { opacity: 0 }], { duration: t(0.18) }),
						play(ch, [{ opacity: 0 }, { opacity: 1 }], { duration: t(0.18) }),
					]);
					fly.remove();
				});
			});
			await wait(t(0.85));

			// 4. The flags roll past, slowing onto --dry-run
			roll.style.display = "";
			roll.style.opacity = "1";
			const col = roll.firstElementChild as HTMLElement;
			play(prompt, [{ opacity: 0.25 }, { opacity: 1 }], { duration: t(0.4), delay: t(0.25) });
			await play(
				col,
				[{ translate: "0 0" }, { translate: `0 ${(-100 * (FLAGS.length - 1)) / FLAGS.length}%` }],
				{ duration: t(1.7), easing: easeGlide }
			);
			await Promise.all(flights);
			el("caret").style.visibility = "hidden";
			await wait(t(0.25));
			await play(
				out,
				[
					{ opacity: 0, translate: "-6px 0" },
					{ opacity: 1, translate: "0 0" },
				],
				{ duration: t(0.3) }
			);

			// 5. Hello
			await wait(t(0.3));
			for (const [i, c] of hello.entries())
				play(
					c,
					[
						{ opacity: 0, translate: "0 18px", filter: "blur(6px)" },
						{ opacity: 1, translate: "0 0", filter: "blur(0)" },
					],
					{ duration: t(0.6), delay: t(i * 0.025), easing: OUT }
				);
			await wait(t(0.6 + HELLO.length * 0.025 - 0.25));
			await play(
				sub,
				[
					{ opacity: 0, translate: "0 8px" },
					{ opacity: 1, translate: "0 0" },
				],
				{ duration: t(0.5) }
			);
			playing.current = false;
			setDone(true);
		},
		!still && (visible || done)
	);

	return (
		<div
			ref={box}
			// Hidden until its parts are where they start (the sequence shows it)
			style={{ visibility: still ? undefined : "hidden" }}
			className="relative flex h-full flex-col items-center justify-center overflow-hidden"
		>
			<AppIcon ref={icon} className="relative size-33 overflow-visible" />
			<Terminal data-g="term" className="relative mt-8 w-130 text-sm leading-[1.7] shadow-lg">
				<span className="sr-only">
					kubectl apply -f exam.yaml --dry-run=client: exam.yaml created (dry run)
				</span>
				<div aria-hidden className="whitespace-pre">
					<span className="text-terminal-prompt">$ </span>
					<span data-g="cmd" className="inline-block overflow-hidden align-bottom">
						{COMMAND}
					</span>
					<span data-g="slot" className="ml-[1ch]">
						<span className="inline-block">-</span>
						<span className="inline-block">-</span>
					</span>
					<span data-g="roll" className="greet-roll">
						{/* Still, it rests on the flag it means */}
						<span
							className="flex flex-col"
							style={
								still
									? { translate: `0 ${(-100 * (FLAGS.length - 1)) / FLAGS.length}%` }
									: undefined
							}
						>
							{FLAGS.map(f => (
								<span
									key={f}
									className={cn("greet-flag", f === "dry-run=client" && "text-highlight")}
								>
									{f}
								</span>
							))}
						</span>
					</span>
					<span data-g="caret" className={cn("greet-caret", still && "invisible")} />
				</div>
				<div data-g="out" aria-hidden>
					exam.yaml <span className="text-terminal-ok">created</span>{" "}
					<span className="text-terminal-muted">(dry run)</span>
				</div>
			</Terminal>
			<h1 className="relative mt-8 font-bold text-[44px] tracking-tight" aria-label={HELLO}>
				{[...HELLO].map((c, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the letters of a fixed line
						key={i}
						data-g="char"
						aria-hidden
						className="inline-block whitespace-pre"
					>
						{c}
					</span>
				))}
			</h1>
			<p data-g="sub" className="relative mt-2.5 text-lead text-muted-foreground">
				Every exam, a dry run first.
			</p>
			<div
				className={cn(
					"relative mt-8 flex flex-col items-center gap-2.5",
					done ? "animate-rise" : "invisible"
				)}
			>
				<Button
					size="default"
					ref={go}
					onClick={onNext}
					className={cn(
						"group/go relative h-11 gap-3 overflow-hidden rounded-full pr-2 pl-6 text-base",
						done && !still && "animate-pop"
					)}
				>
					Get started
					<span className="grid size-8 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover/go:translate-x-0.5">
						<ArrowRight />
					</span>
					{/* A glint across it, once, as it comes */}
					{done && !still && <span aria-hidden className="greet-shine" />}
				</Button>
				<span className="text-caption text-muted-foreground">
					Press <kbd>↵</kbd> · 4 short steps, about a minute
				</span>
			</div>
		</div>
	);
}
