import type * as React from "react";

/** The icon's heptagon, on its 1024 grid */
const HEPTAGON =
	"M436.9,192.4 Q500.0,162.0 563.1,192.4 L694.9,255.9 Q758.0,286.2 773.6,354.5 L806.1,497.2 Q821.7,565.4 778.1,620.2 L686.8,734.6 Q643.2,789.3 573.2,789.3 L426.8,789.3 Q356.8,789.3 313.2,734.6 L221.9,620.2 Q178.3,565.4 193.9,497.2 L226.4,354.5 Q242.0,286.2 305.1,255.9 Z";
/** Where the helm's seven spokes end */
const SPOKES = [
	[500, 270],
	[673.6, 353.6],
	[716.4, 541.4],
	[596.3, 692],
	[403.7, 692],
	[283.6, 541.4],
	[326.4, 353.6],
];

/**
 * The app icon's mark, its heptagon and the helm on it, as SVG shapes on
 * the icon's 1024 grid, for a picture that carries it (a seal, a ticket's
 * watermark): placed and scaled by the `<g>` it is in (`props`). The
 * heptagon fills with `markClassName`; `helmClassName` colours the helm
 * (`stroke` and `fill` both: its spokes and ring are strokes, its hub a fill)
 */
export function AppMark({
	markClassName,
	helmClassName,
	...props
}: React.ComponentProps<"g"> & { markClassName?: string; helmClassName?: string }) {
	return (
		<g aria-hidden {...props}>
			<path d={HEPTAGON} className={markClassName} />
			<g className={helmClassName}>
				{/* Styles, not attributes: a class colouring the helm must not fill the ring */}
				<circle cx="500" cy="492" r="150" strokeWidth="50" style={{ fill: "none" }} />
				{SPOKES.map(([x, y]) => (
					<line
						key={`${x}`}
						x1="500"
						y1="492"
						x2={x}
						y2={y}
						strokeWidth="46"
						strokeLinecap="round"
					/>
				))}
				<circle cx="500" cy="492" r="66" style={{ stroke: "none" }} />
			</g>
		</g>
	);
}
