import { Button } from "@ckdry/ui/components/button";
import { Loading } from "@ckdry/ui/components/loading";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Group, Row } from "@/components/settings/layout";
import { type AppInfo, appApi } from "@/tauri/api";

export function AboutSettings() {
	const [info, setInfo] = useState<AppInfo | null>(null);
	useEffect(() => {
		appApi.info().then(setInfo);
	}, []);
	if (!info) return <Loading fill />;
	return (
		<Group title="CK --dry-run">
			<Row label="Version">
				<span className="text-muted-foreground text-sm tabular-nums">{info.version}</span>
			</Row>
			<Row label="Data folder" detail="Database, kubeconfigs, your questions">
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
		</Group>
	);
}
