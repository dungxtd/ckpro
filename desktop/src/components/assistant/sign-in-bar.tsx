import { Button } from "@cktry/ui/components/button";
import { cn } from "@cktry/ui/lib/utils";
import { useState } from "react";
import { AssistantIcon } from "./assistant-icon";
import { SignInDialog } from "./sign-in-dialog";

/** Where the message is written, while signed out: the way in instead.
 * `to`: what signing in is for ("ask about this task") */
export function SignInBar({ to, className }: { to: string; className?: string }) {
	const [signingIn, setSigningIn] = useState(false);
	return (
		<div
			className={cn("flex items-center gap-3 border-border border-t bg-card/40 py-3", className)}
		>
			<AssistantIcon className="size-4 shrink-0 text-assistant" />
			<span className="flex-1 text-muted-foreground text-xs">
				Sign in with your Claude account to {to}.
			</span>
			<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
				Sign in
			</Button>
			<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
		</div>
	);
}
