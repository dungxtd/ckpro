import { Alert } from "@cktry/ui/components/alert";
import { Button } from "@cktry/ui/components/button";
import { useEnvironment } from "@/stores/environment";
import { envApi } from "@/tauri/api";

/**
 * Docker down or being reached, live from the environment (it clears as
 * Docker comes up), with how to start it on this system as Rust words it:
 * where an exam can be started from
 */
export function DockerBanner() {
	const docker = useEnvironment(s => s.env?.docker);
	const hint = useEnvironment(s => s.env?.issues.find(i => i.component === "docker")?.hint);
	if (docker?.state === "connecting") return <Alert>Connecting to Docker…</Alert>;
	if (docker?.state !== "down") return null;
	return (
		<Alert variant="warning" className="items-center">
			<span className="flex-1">
				<strong>Docker is not running.</strong> {hint ?? "cktry connects as soon as it is up."}
			</span>
			<Button size="push" variant="push" onClick={() => envApi.retry()}>
				Retry now
			</Button>
		</Alert>
	);
}
