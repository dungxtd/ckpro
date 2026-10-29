import { Loading } from "@ckdry/ui/components/loading";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ckdry/ui/components/sheet";
import { useEffect, useState } from "react";
import { ClaudeIcon } from "@/components/claude-icon";
import { Answer, UserMessage } from "@/components/exam/answer";
import { ApiError, type CoachTranscript, coachApi, type HistoryEntry } from "@/tauri/api";

/**
 * A past attempt's assistant sessions, read back: each under its question,
 * latest first. Nothing to ask here; the attempt is over.
 */
export function AttemptChats({
	entry,
	onOpenChange,
}: {
	entry: HistoryEntry | null;
	onOpenChange: (open: boolean) => void;
}) {
	const [chats, setChats] = useState<CoachTranscript[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!entry) return;
		setChats(null);
		setError(null);
		coachApi
			.transcripts(entry.attempt_id)
			.then(setChats, e => setError(e instanceof ApiError ? e.message : String(e)));
	}, [entry]);
	// The question's number and name, as the attempt listed them
	const questionOf = (id: string) => {
		const i = entry?.result.questions.findIndex(q => q.id === id) ?? -1;
		return i >= 0 ? `Question ${i + 1} · ${entry?.result.questions[i]?.title}` : id;
	};

	return (
		<Sheet open={entry !== null} onOpenChange={onOpenChange}>
			<SheetContent className="w-[520px] gap-0 sm:max-w-xl">
				<SheetHeader className="border-border border-b">
					<SheetTitle>Assistant sessions</SheetTitle>
					<SheetDescription>
						{entry?.title} · {entry && new Date(entry.result.started_at ?? 0).toLocaleString()}
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{error ? (
						<p className="text-muted-foreground text-sm">{error}</p>
					) : chats === null ? (
						<Loading fill />
					) : (
						<div className="flex flex-col gap-8">
							{chats.map(chat => (
								<section key={`${chat.question_id}/${chat.session}`} className="flex flex-col">
									<div className="mb-2 border-border border-b pb-1.5">
										<div className="font-medium text-callout">{chat.title}</div>
										<div className="text-2xs text-muted-foreground">
											{questionOf(chat.question_id)}
										</div>
									</div>
									{chat.messages.map((m, i) =>
										m.role === "user" ? (
											// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
											<UserMessage key={i} className={i > 0 ? "mt-4" : undefined}>
												{m.text}
											</UserMessage>
										) : (
											// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
											<div key={i} className="my-1 flex min-w-0 flex-col gap-1.5">
												<ClaudeIcon className="size-3.5 text-claude" />
												<Answer>{m.text}</Answer>
											</div>
										)
									)}
								</section>
							))}
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
