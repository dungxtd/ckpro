import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { DateField } from "@ckpro/ui/components/date-field";
import { cn } from "@ckpro/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { addDays, dayKey } from "@/days";
import { certName, certRole, examDayText } from "@/words";

/** The day filled in to start from, booked or a goal: the first of the
 * third month on (21 Nov: 1 Feb), time enough to prepare */
const startDay = (now: Date) => dayKey(new Date(now.getFullYear(), now.getMonth() + 3, 1));

/** How far away a goal may be put, for an exam not booked yet: each fills
 * the field in, kept only once added */
const READY_IN = [
	{ label: "In a month", days: 30 },
	{ label: "In 2 months", days: 61 },
	{ label: "In 3 months", days: 91 },
	{ label: "In 6 months", days: 182 },
];

/** An exam told: its certification and day, and whether that day is booked
 * (else a goal, the day to be ready by) */
export interface ExamTold {
	certification: string;
	date: string;
	booked: boolean;
}

/**
 * An exam to aim at, asked one question at a time: which exam (of `certs`;
 * asked only when there is a choice), whether it is booked, then its day,
 * typed, or, not booked yet, the day to be ready by (a goal, also picked
 * from how far away); both start from the first of the third month on.
 * `onTell` once added. `compact` in a
 * popover; the first question's words are `first`
 */
export function ExamAsker({
	certs,
	first = "Which exam?",
	compact = false,
	onTell,
}: {
	certs: string[];
	first?: string;
	compact?: boolean;
	onTell: (exam: ExamTold) => void;
}) {
	const today = dayKey(new Date());
	const [cert, setCert] = useState<string | null>(certs.length === 1 ? (certs[0] as string) : null);
	const [booked, setBooked] = useState<boolean | null>(null);
	const [day, setDay] = useState<string | null>(null);
	// The day put in the field (to start from, or a goal's distance picked)
	const [given, setGiven] = useState("");
	const give = (to: string) => {
		setGiven(to);
		setDay(to);
	};
	const passed = day !== null && day < today;
	const size = compact ? "sm" : "md";
	const tell = (date: string, isBooked: boolean) =>
		cert && onTell({ certification: cert, date, booked: isBooked });
	return (
		<div className={cn("flex flex-col", compact ? "gap-3" : "gap-5")}>
			{certs.length > 1 && (
				<Question title={first} compact={compact}>
					{certs.map(c => (
						<Chip
							key={c}
							size={size}
							selected={cert === c}
							aria-pressed={cert === c}
							onClick={() => {
								setCert(c);
								setBooked(null);
								setDay(null);
							}}
						>
							{certName(c)}
							{!compact && <span className="font-normal opacity-70">{certRole(c)}</span>}
						</Chip>
					))}
				</Question>
			)}
			{cert && (
				<Question title={`Have you booked the ${certName(cert)}?`} compact={compact}>
					<Chip
						size={size}
						selected={booked === true}
						aria-pressed={booked === true}
						onClick={() => {
							if (booked === null) give(startDay(new Date()));
							setBooked(true);
						}}
					>
						Yes, I have a day
					</Chip>
					<Chip
						size={size}
						selected={booked === false}
						aria-pressed={booked === false}
						onClick={() => {
							if (booked === null) give(startDay(new Date()));
							setBooked(false);
						}}
					>
						Not yet
					</Chip>
				</Question>
			)}
			{cert && booked !== null && (
				<Question
					title={booked ? "What day?" : "When would you like to be ready?"}
					detail={
						booked
							? day === null
								? undefined
								: examDayText(day)
							: `${day === null ? "" : `${examDayText(day)}. `}A goal, not a booking: set the real day once you book.`
					}
					compact={compact}
				>
					{!booked && (
						<div className="flex w-full flex-wrap gap-2">
							{READY_IN.map(r => {
								const to = dayKey(addDays(new Date(), r.days));
								return (
									<Chip
										key={r.days}
										size={size}
										selected={day === to}
										aria-pressed={day === to}
										onClick={() => give(to)}
									>
										{r.label}
									</Chip>
								);
							})}
						</div>
					)}
					<DateField
						key={cert}
						label={`${certName(cert)} ${booked ? "exam day" : "goal"}`}
						value={given}
						invalid={passed}
						onChange={setDay}
						onCommit={() => {
							if (day && !passed) tell(day, booked);
						}}
					/>
					<Button
						size="push"
						variant="pushDefault"
						disabled={!day || passed}
						onClick={() => day && tell(day, booked)}
					>
						Add
					</Button>
				</Question>
			)}
		</div>
	);
}

/** A question: its words, then its answers in a row */
function Question({
	title,
	detail,
	compact,
	children,
}: {
	title: string;
	detail?: string;
	compact: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex animate-enter flex-col gap-2">
			<span className={compact ? "text-caption text-muted-foreground" : "font-semibold text-sm"}>
				{title}
			</span>
			<div className="flex flex-wrap items-center gap-2">{children}</div>
			{detail && <span className="text-caption text-muted-foreground">{detail}</span>}
		</div>
	);
}
