import { AppMark } from "@ckpro/ui/components/app-mark";
import { Button } from "@ckpro/ui/components/button";
import { Progress } from "@ckpro/ui/components/progress";
import { useSequence } from "@ckpro/ui/hooks/use-sequence";
import { easeDrop, easeGlide, reducedMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import { CircleCheck } from "lucide-react";
import { type Ref, useId, useRef, useState } from "react";
import { GradingCard } from "@/components/exam/grading";
import { daysUntil } from "@/days";
import { useTargets } from "@/stores/settings";
import type { Attempt, ExamResult } from "@/tauri/api";
import { certName, certRole, plural } from "@/words";

/** The stamp in hand, between the two: raised, its shadow under it */
const LIFT = 1.3;
const HELD = "drop-shadow(0 18px 18px rgb(0 0 0 / 0.35))";

/** An id usable in `url(#…)` and `href="#…"` */
const useSvgId = () => useId().replace(/[^\w-]/g, "");

/** A point in the box's scrolled content */
type Point = { x: number; y: number };
/** Where an element lies in a box's scrolled content */
const rectIn = (box: HTMLElement, el: Element) => {
	const b = box.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	const left = r.left - b.left + box.scrollLeft;
	const top = r.top - b.top + box.scrollTop;
	return {
		left,
		top,
		right: left + r.width,
		centre: { x: left + r.width / 2, y: top + r.height / 2 },
	};
};
const at = ({ x, y }: Point, turn: number, scale = 1) =>
	`translate(${x}px, ${y}px) rotate(${turn}deg) scale(${scale})`;

/**
 * The first exam-mode attempt of a certification that passes: before its
 * Results, the moment itself. The graded card is stamped PASSED; it makes
 * way for a certificate made out to the candidate, and the same stamp,
 * turned over to its CKPRO face, comes down on the certificate's corner as
 * its seal (one stamp, two faces). Under reduced motion the certificate is there, sealed, at once.
 * Once per certification (Settings' `certified`); Results follow on the button
 */
export function FirstPass({
	attempt,
	result,
	onDone,
}: {
	attempt: Attempt;
	result: ExamResult;
	onDone: () => void;
}) {
	const cert = attempt.certification;
	const target = useTargets().find(t => t.certification === cert);
	const days = target ? daysUntil(target.date, new Date()) : null;
	const finished = new Date(result.finished_at ?? Date.now());
	const day = finished.toLocaleDateString(undefined, {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const [still] = useState(reducedMotion);
	const [act, setAct] = useState<"graded" | "certificate">(still ? "certificate" : "graded");
	const [sealed, setSealed] = useState(still);
	const box = useRef<HTMLDivElement>(null);
	const card = useRef<HTMLDivElement>(null);
	const stamp = useRef<HTMLDivElement>(null);
	const seal = useRef<SVGSVGElement>(null);
	// Where the stamp is held after the card, before it comes down on the seal
	const stampAt = useRef<Point>({ x: 0, y: 0 });

	// The graded card, stamped PASSED, then out of the way
	useSequence(async ({ wait, play }) => {
		const [b, c, s] = [box.current, card.current, stamp.current];
		if (!b || !c || !s) return;
		// Over the card's top right, across its first scores
		const r = rectIn(b, c);
		const p = { x: r.right - 130, y: r.top + 70 };
		stampAt.current = p;
		await wait(300);
		await play(
			s,
			[
				{ opacity: 0, transform: at(p, -24, 2.3) },
				{ opacity: 1, transform: at(p, -9) },
			],
			{ duration: 280, easing: easeDrop }
		);
		// Pressed: the ink spreads, the card gives under it
		const splat = s.children[2];
		if (splat)
			play(
				splat,
				[
					{ opacity: 0.5, scale: 0.7 },
					{ opacity: 0, scale: 1.5 },
				],
				{ duration: 500, easing: "ease-out" }
			);
		play(
			c,
			[{ translate: "0 0" }, { translate: "0 5px" }, { translate: "0 -2px" }, { translate: "0 0" }],
			{
				duration: 260,
				fill: "none",
			}
		);
		await wait(1100);
		// The card goes; the stamp is lifted off it, kept in hand
		const up = { x: p.x, y: p.y - 26 };
		stampAt.current = up;
		play(s, [{ transform: at(p, -9) }, { transform: at(up, -9, LIFT) }], {
			duration: 450,
			easing: "ease-out",
		});
		play(s.children[0], [{ filter: "none" }, { filter: HELD }], { duration: 450 });
		await play(c, [{ opacity: 1 }, { opacity: 0, translate: "0 -20px" }], {
			duration: 450,
			easing: "ease-in",
		});
		setAct("certificate");
	}, !still);

	// The certificate risen and signed: the stamp is turned over to its CKPRO
	// face above the corner, then comes down there as the seal
	useSequence(
		async ({ wait, play }) => {
			const [b, s, to] = [box.current, stamp.current, seal.current];
			const [front, back] = s ? [s.children[0], s.children[1]] : [];
			const paper = to?.parentElement;
			if (!b || !s || !to || !front || !back || !paper) return;
			await wait(1900);
			const p = rectIn(b, to).centre;
			const above = { x: p.x, y: p.y - 40 };
			const moved = play(
				s,
				[{ transform: at(stampAt.current, -9, LIFT) }, { transform: at(above, -8, 1.35) }],
				{
					duration: 700,
					easing: easeGlide,
				}
			);
			await wait(100);
			await play(front, [{ scale: "1 1" }, { scale: "0 1" }], { duration: 250, easing: "ease-in" });
			await play(
				back,
				[
					{ opacity: 1, scale: "0 1" },
					{ opacity: 1, scale: "1 1" },
				],
				{ duration: 250, easing: "ease-out" }
			);
			await moved;
			await wait(100);
			await play(s, [{ transform: at(above, -8, 1.35) }, { transform: at(p, -8) }], {
				duration: 200,
				easing: easeDrop,
			});
			play(
				paper,
				[
					{ translate: "0 0" },
					{ translate: "0 5px" },
					{ translate: "0 -2px" },
					{ translate: "0 0" },
				],
				{
					duration: 260,
					fill: "none",
				}
			);
			setSealed(true);
		},
		act === "certificate" && !still
	);

	return (
		<div
			ref={box}
			className="relative flex h-full flex-col items-center justify-center gap-2 overflow-auto p-8 text-center"
		>
			{act === "graded" ? (
				<GradingCard
					ref={card}
					head={
						<>
							<div className="flex items-center gap-2 font-semibold">
								<CircleCheck className="size-5 text-success" aria-hidden />
								Graded · {Math.round(result.score ?? 0)}%
								<span className="ml-auto truncate font-normal text-callout text-muted-foreground">
									{attempt.title}
								</span>
							</div>
							<Progress value={100} tone="success" label="Graded" />
						</>
					}
					titles={result.questions.map(q => q.title)}
					scores={result.questions}
				/>
			) : (
				<>
					<h2 className="animate-enter animate-delay-100 font-bold text-title tracking-tight">
						You passed your first {certName(cert)} exam.
					</h2>
					<p className="animate-enter animate-delay-350 text-lead text-muted-foreground">
						{days !== null && days >= 0
							? `${target?.goal ? `Your ${certName(cert)} goal` : `Your real ${certName(cert)}`} is in ${plural(days, "day")}, and you can already pass it in time.`
							: "You can already pass it in time. Set your exam day when you're ready."}
					</p>
					<div
						className="cert mt-6 animate-rise animate-delay-600"
						role="img"
						aria-label={`Certificate: ${certRole(cert)}, ${day}`}
					>
						<div className="cert-frame">
							<div className="cert-head">
								<span>CKPRO</span>
								<span>Practice edition</span>
							</div>
							<div className="cert-kind">Certificate</div>
							<div className="cert-line">This is to certify that</div>
							<div className="cert-name">
								<span className="animate-enter animate-delay-1150">you</span>
							</div>
							<div className="cert-line">
								passed, on real clusters and against the clock, a full practice exam for
							</div>
							<div className="cert-role">{certRole(cert)}</div>
							<div className="cert-foot">
								<div>
									<span className="inline-block animate-enter animate-delay-1300">{day}</span>
									<small>Date</small>
								</div>
								<div>
									<span className="cert-mono">
										CKP-{certName(cert)}-{attempt.id.slice(0, 4).toUpperCase()}
									</span>
									<small>Certificate ID</small>
								</div>
								<div>
									<svg
										className="cert-sign animate-delay-1450"
										viewBox="0 0 220 40"
										aria-hidden="true"
									>
										<path d="M4 28 C 20 6, 34 6, 40 24 S 60 36, 70 18 S 92 4, 100 22 S 124 34, 136 16 S 160 8, 170 24 S 196 30, 216 14" />
									</svg>
									<small>Signed by the clusters it was proven on</small>
								</div>
							</div>
						</div>
						<Seal ref={seal} className={cn("cert-seal", !sealed && "invisible")} />
					</div>
					<div className="mt-6 h-9">
						{sealed && (
							<Button
								variant="pushDefault"
								size="push"
								onClick={onDone}
								autoFocus
								className={cn(!still && "animate-enter animate-delay-200")}
							>
								See your results
							</Button>
						)}
					</div>
				</>
			)}
			{/* The stamp: PASSED on its face, the seal it becomes behind */}
			{!still && !sealed && (
				<div ref={stamp} className="pass-stamp" aria-hidden>
					<PassedStamp on={finished} />
					<Seal className="pass-stamp-seal" />
					<span className="pass-stamp-splat" />
				</div>
			)}
		</div>
	);
}

/** The rubber stamp's face: PASSED in ink that did not take everywhere,
 * CKPRO's and the day's under it */
function PassedStamp({ on }: { on: Date }) {
	const ink = useSvgId();
	const day = `${on.getDate()} ${on.toLocaleDateString("en", { month: "short" })} ${on.getFullYear()}`;
	return (
		<svg className="pass-stamp-face" viewBox="0 0 188 88" aria-hidden="true">
			<filter id={ink} x="-5%" y="-5%" width="110%" height="110%">
				<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="n" />
				<feColorMatrix
					in="n"
					type="matrix"
					values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.2 0 0 0 1.85"
					result="m"
				/>
				<feComposite in="SourceGraphic" in2="m" operator="in" />
			</filter>
			<g filter={`url(#${ink})`}>
				<rect
					x="3"
					y="3"
					width="182"
					height="82"
					rx="12"
					fill="none"
					stroke="currentColor"
					strokeWidth="4.5"
				/>
				<rect
					x="10"
					y="10"
					width="168"
					height="68"
					rx="7"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
				/>
				<text className="pass-stamp-word" x="94" y="52">
					PASSED
				</text>
				<text className="pass-stamp-sub" x="94" y="69">
					CKPRO · {day.toUpperCase()}
				</text>
			</g>
		</svg>
	);
}

/** The CKPRO seal, on the certificate's corner */
function Seal({ className, ref }: { className?: string; ref?: Ref<SVGSVGElement> }) {
	const id = useSvgId();
	return (
		<svg ref={ref} className={className} viewBox="0 0 140 170" aria-hidden="true">
			<path className="cert-ribbon" d="M48 104 L36 166 L56 152 L68 168 L74 110 Z" />
			<path className="cert-ribbon" d="M92 104 L104 166 L84 152 L72 168 L66 110 Z" />
			<circle cx="70" cy="66" r="62" className="cert-seal-ring" />
			<circle cx="70" cy="66" r="44" className="cert-seal-core" />
			<circle cx="70" cy="66" r="46.5" className="cert-seal-dots" />
			<path id={`${id}-top`} d="M18 66 A52 52 0 0 1 122 66" fill="none" />
			<path id={`${id}-bottom`} d="M14.5 66 A55.5 55.5 0 0 0 125.5 66" fill="none" />
			<text className="cert-seal-text">
				<textPath href={`#${id}-top`} startOffset="50%">
					CKPRO · PRACTICE
				</textPath>
			</text>
			<text className="cert-seal-text">
				<textPath href={`#${id}-bottom`} startOffset="50%">
					PROVEN ON REAL CLUSTERS
				</textPath>
			</text>
			<AppMark
				transform="translate(70 66) scale(.0922) translate(-515 -475)"
				markClassName="cert-mark"
				helmClassName="cert-helm"
			/>
		</svg>
	);
}
