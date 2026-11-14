import { Button } from "@ckpro/ui/components/button";
import { Textarea } from "@ckpro/ui/components/textarea";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { ModuleCard } from "@/components/home/modules/module-card";

/** Ask Claude for an exam: what it should be, or one of the suggestions
 * the attempts point to; Create carries it to the Create screen */
export function AskClaude({ suggestions }: { suggestions: string[] }) {
	const [text, setText] = useState("");
	const navigate = useNavigate();
	const ask = (value: string) =>
		value.trim() && navigate(`/create?ask=${encodeURIComponent(value.trim())}`);
	return (
		<ModuleCard
			title={
				<span className="flex items-center gap-1.5">
					<AssistantIcon className="size-3.5 text-assistant" /> Make an exam with Claude
				</span>
			}
			className="bg-assistant/[0.07]"
		>
			<Textarea
				value={text}
				onChange={e => setText(e.target.value)}
				placeholder="Describe the exam you want: the topics, how long, how hard…"
				aria-label="The exam you want"
				rows={3}
				className="min-h-0 flex-1 resize-none"
			/>
			<div className="mt-2.5 flex flex-wrap gap-1.5">
				{suggestions.map(s => (
					<button
						key={s}
						type="button"
						onClick={() => ask(s)}
						className="rounded-full px-2.5 py-0.5 text-caption ring-1 ring-assistant/40 ring-inset hover:bg-assistant/10"
					>
						{s}
					</button>
				))}
			</div>
			<div className="mt-2.5 flex items-center gap-3">
				<span className="min-w-0 flex-1 text-2xs text-muted-foreground">
					Claude reads your readiness, failed checks and plans. Nothing is saved until you verify
					it.
				</span>
				<Button size="push" variant="assistant" disabled={!text.trim()} onClick={() => ask(text)}>
					Create
				</Button>
			</div>
		</ModuleCard>
	);
}
