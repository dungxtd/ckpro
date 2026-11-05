import { Button } from "@ckpro/ui/components/button";
import { CodeBlock } from "@ckpro/ui/components/code-block";
import { Lock } from "lucide-react";
import { useState } from "react";
import { withoutSpoilers } from "./spoilers";

/**
 * A question's YAML to read without being told its answer: its solution and
 * hints stay folded until asked for, saying it spoils the question
 */
export function QuestionScripts({ yaml }: { yaml: string }) {
	const [spoiled, setSpoiled] = useState(false);
	const { shown, hidden } = withoutSpoilers(yaml);
	return (
		<div className="flex flex-col gap-1.5">
			<CodeBlock title="yaml" wrap>
				{spoiled ? yaml.trimEnd() : shown}
			</CodeBlock>
			{hidden && !spoiled && (
				<div className="flex items-center gap-2 rounded-md border border-warning/40 border-dashed bg-warning/5 px-2.5 py-1.5 text-caption">
					<Lock className="size-3.5 shrink-0 text-warning" />
					<span className="flex-1">
						Solution and hints hidden: reading them spoils the question
					</span>
					<Button size="push" variant="quiet" onClick={() => setSpoiled(true)}>
						Show
					</Button>
				</div>
			)}
		</div>
	);
}
