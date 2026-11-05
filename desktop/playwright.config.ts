import { defineConfig, devices } from "@playwright/test";

/**
 * The interface in a browser with Rust stood in for (e2e/backend.ts): in
 * WebKit (the app's web view on macOS and Linux) and Chromium (WebView2 on
 * Windows)
 */
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: "http://localhost:4174",
		viewport: { width: 1300, height: 800 },
		colorScheme: "dark",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"], viewport: { width: 1300, height: 800 } },
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1300, height: 800 } },
		},
	],
	webServer: {
		command: "pnpm exec vite --port 4174 --strictPort",
		url: "http://localhost:4174",
		reuseExistingServer: !process.env.CI,
	},
});
