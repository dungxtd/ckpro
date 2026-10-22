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
	build: { minify: process.env.TAURI_ENV_DEBUG ? false : "oxc" },
	resolve: {
		dedupe: ["react", "react-dom", "sonner"],
		alias: { "@": path.resolve(__dirname, "./src") },
	},
});
