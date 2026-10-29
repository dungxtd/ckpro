import { Markdown } from "@/components/text/markdown";
import type { Attempt } from "@/tauri/api";

/** The Remote Desktop's ReadMe tab: how the exam environment works. */
export function ReadMe({ attempt }: { attempt: Attempt }) {
	const hosts = attempt.clusters.map(c => `\`${c}\``).join(", ");
	return (
		<div className="h-full overflow-auto p-6">
			<div className="mx-auto max-w-3xl">
				<Markdown>{`
## Exam environment

The Remote Desktop is the machine **base**. It has no Kubernetes tools: every task names the host to solve it on.

- **Connect to the right host** for each task, as its infobox says: \`ssh <host>\` (hosts in this exam: ${hosts}). Tasks solved on the wrong host may score zero.
- When a task is done, \`exit\` back to **base** before the next one. Nested ssh is not supported.
- Root on a host: \`sudo -i\`, or prefix single commands with \`sudo\`.
- Nodes are reached by name too, from **base**: \`ssh <node>\`.
- Do **not** reboot the base node.

### Tools on the hosts

\`kubectl\` with the alias \`k\` and Bash completion, \`helm\`, \`etcdctl\`, \`yq\`, \`jq\`, \`curl\`, \`wget\`, \`man\`, \`vim\` and \`nano\`.

### Desktop

- **Terminal**: copy with **Ctrl+Shift+C**, paste with **Ctrl+Shift+V** (or the right-click menu). Other apps use Ctrl+C / Ctrl+V.
- **vim**: type \`:set paste\` before typing or pasting YAML, or auto-indent adds to your indentation.
- **Firefox**: only the allowed documentation opens (kubernetes.io/docs and blog, helm.sh/docs…, and each task's Quick Reference). Search on kubernetes.io works; external results do not open.
- **VSCodium**: a code editor on **base** (not on the task hosts). Extensions cannot be installed.
- **Virtual Keyboard**: for keys that do not reach the desktop.
- Text copied from a task in the left panel can be pasted on the desktop.

### Exam console

- **− / +**: make the desktop larger or smaller. **⚙ Settings**: fit the desktop to the screen, set a custom resolution, or reset the desktop when it stops responding.
- The timer warns at 30, 15 and 5 minutes left; the exam is submitted when time is up.
- Flag questions to come back to them; **End exam** grades every task.
`}</Markdown>
			</div>
		</div>
	);
}
