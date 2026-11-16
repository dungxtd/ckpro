import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { DateField } from "@ckpro/ui/components/date-field";
import { cn } from "@ckpro/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { addDays, dayKey } from "@/days";
import { certName, certRole, examDayText } from "@/words";

/** How far away a goal is put, for an exam not booked yet: when to be ready */
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
 * typed, or, not booked yet, when to be ready by (a goal). Nothing is
 * filled in for the candidate. `onTell` once answered. `compact` in a
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
						onClick={() => setBooked(true)}
					>
						Yes, I have a day
					</Chip>
					<Chip
						size={size}
						selected={booked === false}
						aria-pressed={booked === false}
						onClick={() => setBooked(false)}
					>
						Not yet
					</Chip>
				</Question>
			)}
			{cert && booked === true && (
				<Question
					title="What day?"
					detail={day === null ? undefined : examDayText(day)}
					compact={compact}
				>
					<DateField
						key={cert}
						label={`${certName(cert)} exam day`}
						value=""
						invalid={passed}
						onChange={setDay}
						onCommit={() => {
							if (day && !passed) tell(day, true);
						}}
					/>
					<Button
						size="push"
						variant="pushDefault"
						disabled={!day || passed}
						onClick={() => day && tell(day, true)}
					>
						Add
					</Button>
				</Question>
			)}
			{cert && booked === false && (
				<Question
					title="When would you like to be ready?"
					detail="A goal, not a booking: Home counts down to it; set the real day once you book."
					compact={compact}
				>
					{READY_IN.map(r => (
						<Chip
							key={r.days}
							size={size}
							onClick={() => tell(dayKey(addDays(new Date(), r.days)), false)}
						>
							{r.label}
						</Chip>
					))}
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
