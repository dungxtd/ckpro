import { Terminal } from "@cktry/ui/components/terminal";
import type * as React from "react";
import type { Line } from "./describe";

const TONE = {
	command: Terminal.Command,
	muted: Terminal.Muted,
	ok: Terminal.Ok,
	warn: Terminal.Warn,
	note: Terminal.Note,
};

/** `kubectl describe day`, as a terminal prints it */
export function DescribeCard({ lines, ...props }: React.ComponentProps<"pre"> & { lines: Line[] }) {
	return (
		<Terminal {...props}>
			{lines.map((line, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: lines in order, never moved
				<span key={i}>
					{line.map(([text, tone], j) => {
						const Tone = tone && TONE[tone];
						// biome-ignore lint/suspicious/noArrayIndexKey: parts of a line, in order
						return Tone ? <Tone key={j}>{text}</Tone> : <span key={j}>{text}</span>;
					})}
					{"\n"}
				</span>
			))}
		</Terminal>
	);
}
