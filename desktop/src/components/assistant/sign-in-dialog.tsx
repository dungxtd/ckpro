import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ckdry/ui/components/dialog";
import { Input } from "@ckdry/ui/components/input";
import { Spinner } from "@ckdry/ui/components/spinner";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCoach } from "@/stores/coach";
import { ApiError, browserApi, coachApi, type SignInMethod } from "@/tauri/api";

const METHODS: { method: SignInMethod; label: string; detail: string }[] = [
	{ method: "claude", label: "Claude subscription", detail: "Pro or Max plan" },
	{ method: "console", label: "Anthropic Console", detail: "API usage billing" },
];

/** The last sign-in link the CLI printed */
const linkIn = (output: string) => output.match(/https:\/\/\S+/g)?.at(-1);

/**
 * Sign in to Claude: the Claude CLI's own login runs (it
 * opens the browser), its output shows here, and a code the browser shows
 * can be pasted back. The login stays in the assistant's Docker volume.
 */
export function SignInDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const loadAccount = useCoach(s => s.loadAccount);
	const [running, setRunning] = useState(false);
	const [output, setOutput] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const link = linkIn(output);

	const start = async (method: SignInMethod) => {
		setRunning(true);
		setOutput("");
		setError(null);
		try {
			await coachApi.signIn(method, text => setOutput(o => (o + text).slice(-8000)));
			await loadAccount();
			const email = useCoach.getState().account?.email;
			toast.success(email ? `Signed in as ${email}` : "Signed in to Claude");
			onOpenChange(false);
		} catch (e) {
			if (!(e instanceof ApiError && e.code === "cancelled"))
				setError(e instanceof Error ? e.message : String(e));
		} finally {
			setRunning(false);
		}
	};
	const close = (next: boolean) => {
		if (!next && running) coachApi.signInCancel();
		onOpenChange(next);
	};
	const send = () => {
		if (!code.trim()) return;
		coachApi.signInInput(code).catch(e => setError(String(e)));
		setCode("");
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Sign in to Claude</DialogTitle>
					<DialogDescription>
						Open the sign-in page, approve, and paste the code it shows. The login stays in the
						assistant's Docker volume, not on this Mac.
					</DialogDescription>
				</DialogHeader>

				{!running ? (
					<div className="grid gap-2">
						{METHODS.map(m => (
							<Button
								key={m.method}
								variant="outline"
								className="h-auto justify-start py-2"
								onClick={() => start(m.method)}
							>
								<span className="flex flex-col items-start">
									<span>{m.label}</span>
									<span className="font-normal text-muted-foreground text-xs">{m.detail}</span>
								</span>
							</Button>
						))}
					</div>
				) : (
					<div className="flex min-w-0 flex-col gap-3">
						<div className="flex items-center gap-2 text-sm">
							<Spinner />
							<span className="flex-1">Finish signing in in your browser…</span>
							{link && (
								<Button size="sm" variant="outline" onClick={() => browserApi.open(link)}>
									<ExternalLink />
									Open page
								</Button>
							)}
						</div>
						{output.trim() && (
							<CodeBlock wrap className="max-h-40">
								{output.trim()}
							</CodeBlock>
						)}
						<form
							className="flex gap-2"
							onSubmit={e => {
								e.preventDefault();
								send();
							}}
						>
							<Input
								value={code}
								onChange={e => setCode(e.target.value)}
								placeholder="Code from the browser, if it shows one"
								aria-label="Code from the browser"
							/>
							<Button type="submit" variant="outline" disabled={!code.trim()}>
								Send
							</Button>
						</form>
					</div>
				)}

				{error && <Alert variant="destructive">{error}</Alert>}
				<DialogFooter>
					<Button variant="ghost" onClick={() => close(false)}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
