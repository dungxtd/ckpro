// Upload the interface's source maps to PostHog, then drop them from the
// bundle; only when a key is given (a release build), else nothing. Node,
// not a shell line: pnpm runs scripts with cmd.exe on Windows.
import { spawnSync } from "node:child_process";

if (!process.env.POSTHOG_CLI_API_KEY) process.exit(0);
const run = spawnSync(
	"posthog-cli",
	[
		"sourcemap",
		"process",
		"--directory",
		"dist",
		"--release-name",
		"cktry",
		"--release-version",
		process.env.npm_package_version ?? "0.0.0",
		"--delete-after",
	],
	{ stdio: "inherit", shell: process.platform === "win32" }
);
process.exit(run.status ?? 1);
