import { type Ref, useId } from "react";

/** Where the helm's seven spokes end, on the icon's 1024 grid */
export const SPOKES = [
	[500, 270],
	[673.6, 353.6],
	[716.4, 541.4],
	[596.3, 692],
	[403.7, 692],
	[283.6, 541.4],
	[326.4, 353.6],
];
const HEPTAGON =
	"M436.9,192.4 Q500.0,162.0 563.1,192.4 L694.9,255.9 Q758.0,286.2 773.6,354.5 L806.1,497.2 Q821.7,565.4 778.1,620.2 L686.8,734.6 Q643.2,789.3 573.2,789.3 L426.8,789.3 Q356.8,789.3 313.2,734.6 L221.9,620.2 Q178.3,565.4 193.9,497.2 L226.4,354.5 Q242.0,286.2 305.1,255.9 Z";
/** The prompt's two pills, at their left */
export const PILLS = [636, 756];

/**
 * The app icon (`src-tauri/icons/source.svg`) with its parts named, so the
 * greeting can put it together: `data-part` tile, washes, hept, ring,
 * spoke (seven), hub, helm, pill (two) and cut (the pills' cut-outs). The
 * same picture as the icon, drawn in the page
 */
export function AppIcon({ ref, className }: { ref?: Ref<SVGSVGElement>; className?: string }) {
	// Its gradients and filters, its own: nothing else on the page shares them
	const p = useId().replace(/[^\w-]/g, "");
	const id = (name: string) => `${p}-${name}`;
	const url = (name: string) => `url(#${id(name)})`;
	return (
		<svg ref={ref} className={className} viewBox="0 0 1024 1024" role="img" aria-label="CKPro">
			<defs>
				<filter id={id("sh")} x="-10%" y="-10%" width="120%" height="125%">
					<feDropShadow dx="0" dy="14" stdDeviation="18" floodOpacity="0.22" />
				</filter>
				<clipPath id={id("box")}>
					<rect x="100" y="100" width="824" height="824" rx="186" />
				</clipPath>
				{(
					[
						["pink", "0", "1", "0.6", "#f59ac2", ".5"],
						["peach", ".45", "1", ".55", "#fde7c2", ".6"],
						["mint", "1", ".7", ".6", "#c8ece4", ".6"],
						["sky", "1", "0", ".7", "#d9e4fb", ".9"],
					] as const
				).map(([name, cx, cy, r, colour, at]) => (
					<radialGradient key={name} id={id(name)} cx={cx} cy={cy} r={r}>
						<stop offset="0" stopColor={colour} stopOpacity={at} />
						<stop offset="1" stopColor={colour} stopOpacity="0" />
					</radialGradient>
				))}
				<linearGradient id={id("ink")} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#3b3b3e" />
					<stop offset="1" stopColor="#121214" />
				</linearGradient>
				<linearGradient id={id("blue")} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#5a92f5" />
					<stop offset="1" stopColor="#2553c9" />
				</linearGradient>
				<filter
					id={id("gloss")}
					filterUnits="userSpaceOnUse"
					x="0"
					y="0"
					width="1024"
					height="1024"
				>
					<feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
					<feOffset in="b" dx="0" dy="3.5" result="o" />
					<feComposite in="SourceAlpha" in2="o" operator="out" result="edge" />
					<feFlood floodColor="#fff" floodOpacity=".38" />
					<feComposite in2="edge" operator="in" result="light" />
					<feDropShadow
						in="SourceGraphic"
						dx="0"
						dy="10"
						stdDeviation="12"
						floodOpacity=".22"
						result="g"
					/>
					<feMerge>
						<feMergeNode in="g" />
						<feMergeNode in="light" />
					</feMerge>
				</filter>
				<mask id={id("k")} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
					<rect width="1024" height="1024" fill="#fff" />
					<g stroke="#000" strokeWidth="56" strokeLinejoin="round" fill="#000">
						{PILLS.map(x => (
							<rect key={x} data-part="cut" x={x} y="706" width="96" height="50" rx="25" />
						))}
					</g>
				</mask>
			</defs>
			<g data-part="tile">
				<rect x="100" y="100" width="824" height="824" rx="186" fill="#f4f3f7" filter={url("sh")} />
				<g clipPath={url("box")}>
					{["sky", "mint", "peach", "pink"].map(name => (
						<rect key={name} data-part="wash" width="1024" height="1024" fill={url(name)} />
					))}
				</g>
				<rect
					x="100"
					y="100"
					width="824"
					height="824"
					rx="186"
					fill="none"
					stroke="#fff"
					strokeOpacity=".7"
					strokeWidth="3"
				/>
			</g>
			<g filter={url("gloss")}>
				<g mask={url("k")}>
					<path data-part="hept" d={HEPTAGON} fill={url("blue")} />
					<g data-part="helm">
						<circle
							data-part="ring"
							cx="500"
							cy="492"
							r="150"
							fill="none"
							stroke="#f4f3f7"
							strokeWidth="50"
						/>
						{SPOKES.map(([x, y]) => (
							<line
								key={`${x}`}
								data-part="spoke"
								x1="500"
								y1="492"
								x2={x}
								y2={y}
								stroke="#f4f3f7"
								strokeWidth="46"
								strokeLinecap="round"
							/>
						))}
						<circle data-part="hub" cx="500" cy="492" r="66" fill="#f4f3f7" />
					</g>
				</g>
			</g>
			<g data-part="prompt" filter={url("gloss")} fill={url("ink")}>
				{PILLS.map(x => (
					<rect key={x} data-part="pill" x={x} y="706" width="96" height="50" rx="25" />
				))}
			</g>
		</svg>
	);
}
