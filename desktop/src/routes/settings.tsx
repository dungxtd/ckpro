import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ckdry/ui/components/tabs";
import { Info, Monitor, Sparkles } from "lucide-react";
import { AboutSettings } from "@/components/settings/about-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { DeskSettings } from "@/components/settings/desk-settings";
import { Page } from "@/components/settings/layout";

/**
 * The app's settings in sections, as macOS System Settings lays them out: the
 * exam desk, the AI (the assistant, its Claude Code runtime, what its agent
 * may do and what it is given), and about the app.
 */
export function SettingsRoute() {
	return (
		<Tabs defaultValue="ai" className="h-full">
			<TabsList aria-label="Settings">
				<TabsTrigger value="general">
					<Monitor /> Exam desk
				</TabsTrigger>
				<TabsTrigger value="ai">
					<Sparkles /> AI
				</TabsTrigger>
				<TabsTrigger value="about">
					<Info /> About
				</TabsTrigger>
			</TabsList>
			<TabsContent value="general">
				<Page>
					<DeskSettings />
				</Page>
			</TabsContent>
			<TabsContent value="ai">
				<Page>
					<AiSettings />
				</Page>
			</TabsContent>
			<TabsContent value="about">
				<Page>
					<AboutSettings />
				</Page>
			</TabsContent>
		</Tabs>
	);
}
