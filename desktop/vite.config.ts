import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tauri expects a fixed port (devUrl in tauri.conf.json)
export default defineConfig({
	plugins: [tailwindcss(), react()],
	clearScreen: false,
	server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
	envPrefix: ["VITE_", "TAURI_"],
	build: {
		minify: process.env.TAURI_ENV_DEBUG ? false : "oxc",
		// For PostHog's stack traces, uploaded and removed after the build
		// (`pnpm sourcemaps`); none without its key
		sourcemap: process.env.POSTHOG_CLI_API_KEY ? "hidden" : false,
	},
	resolve: {
		dedupe: ["react", "react-dom", "sonner"],
		alias: { "@": path.resolve(__dirname, "./src") },
	},
});
