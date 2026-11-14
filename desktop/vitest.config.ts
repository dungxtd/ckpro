import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config";

// Unit tests beside the code, the kit's too; e2e/ is Playwright's (pnpm e2e)
export default mergeConfig(
	vite,
	defineConfig({ test: { include: ["src/**/*.test.ts", "../packages/ckpro-ui/src/**/*.test.ts"] } })
);
