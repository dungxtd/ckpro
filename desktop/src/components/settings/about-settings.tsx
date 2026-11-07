import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { Switch } from "@ckpro/ui/components/switch";
import { ChartNoAxesColumn, Copy, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Group, Row } from "@/components/settings/layout";
import { useSettings } from "@/stores/settings";
import { type AppInfo, appApi } from "@/tauri/api";
import appIcon from "../../../src-tauri/icons/128x128@2x.png";

export function AboutSettings() {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const analytics = useSettings(s => s.settings.analytics);
	const update = useSettings(s => s.update);
	useEffect(() => {
		appApi.info().then(setInfo);
	}, []);
	if (!info) return <Loading fill label="Loading…" />;
	return (
		<>
			<Group title="App">
				<Row
					icon={<FolderOpen />}
					label="Data folder"
					detail="Database, kubeconfigs, your questions"
				>
					<Button
						size="push"
						variant="push"
						onClick={() => {
							navigator.clipboard.writeText(info.data_dir).then(
								() => toast.success("Path copied", { duration: 1500 }),
								() => toast.error("Could not copy the path")
							);
						}}
					>
						<Copy /> Copy path
					</Button>
				</Row>
				<Row
					icon={<ChartNoAxesColumn />}
					label="Share usage analytics"
					detail="Anonymous: which screens and features are used, errors, replays of the interface. Never your answers, messages to the assistant, or the remote desktop"
				>
					<Switch
						checked={analytics}
						onCheckedChange={on => update({ analytics: on })}
						aria-label="Share usage analytics"
					/>
				</Row>
			</Group>
			{/* Who the app is, at the end of the page */}
			<footer className="flex select-none flex-col items-center gap-1 pt-4 text-center">
				<img src={appIcon} alt="" className="size-16" />
				<div className="font-semibold">ckpro</div>
				<div className="text-caption text-muted-foreground tabular-nums">
					Version {info.version}
				</div>
			</footer>
		</>
	);
}
