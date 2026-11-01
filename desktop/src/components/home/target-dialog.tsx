import { Button } from "@ckdry/ui/components/button";
import { Chip } from "@ckdry/ui/components/chip";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ckdry/ui/components/dialog";
import { Input } from "@ckdry/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { useEffect, useState } from "react";
import { dayKey } from "@/days";
import { useSettings } from "@/stores/settings";
import type { ExamTarget } from "@/tauri/api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The exam the candidate prepares for: its certification, its day, and the
 * days of the week kept free. Saved in the settings; the preparation starts
 * the day it is first set
 */
export function TargetDialog({
	open,
	onOpenChange,
	certifications,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	certifications: string[];
}) {
	const current = useSettings(s => s.settings.target);
	const update = useSettings(s => s.update);
	const [draft, setDraft] = useState<ExamTarget | null>(null);
	useEffect(() => {
		if (open)
			setDraft(
				current ?? {
					certification: certifications[0] ?? "cka",
					date: dayKey(new Date(Date.now() + 60 * 86_400_000)),
					started: dayKey(new Date()),
					rest_days: [],
				}
			);
	}, [open, current, certifications]);
	if (!draft) return null;
	const today = dayKey(new Date());
	const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && draft.date > today;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>The exam you prepare for</DialogTitle>
					<DialogDescription>Home and the Calendar count toward it.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between gap-4 text-callout">
						Certification
						<Select
							value={draft.certification}
							onValueChange={v => setDraft({ ...draft, certification: v })}
						>
							<SelectTrigger aria-label="Certification">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{certifications.map(c => (
									<SelectItem key={c} value={c}>
										{c.toUpperCase()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center justify-between gap-4 text-callout">
						Exam day
						<Input
							type="date"
							aria-label="Exam day"
							className="w-44"
							min={today}
							value={draft.date}
							onChange={e => setDraft({ ...draft, date: e.target.value })}
						/>
					</div>
					<div className="flex flex-col gap-2 text-callout">
						Days kept free
						<div className="flex flex-wrap gap-1.5">
							{WEEKDAYS.map((d, i) => (
								<Chip
									key={d}
									selected={draft.rest_days.includes(i)}
									onClick={() =>
										setDraft({
											...draft,
											rest_days: draft.rest_days.includes(i)
												? draft.rest_days.filter(x => x !== i)
												: [...draft.rest_days, i].sort(),
										})
									}
								>
									{d}
								</Chip>
							))}
						</div>
					</div>
				</div>
				<DialogFooter>
					{current && (
						<Button
							variant="ghost"
							className="mr-auto"
							onClick={() => {
								update({ target: null });
								onOpenChange(false);
							}}
						>
							Remove target
						</Button>
					)}
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={!valid}
						onClick={() => {
							update({ target: draft });
							onOpenChange(false);
						}}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
