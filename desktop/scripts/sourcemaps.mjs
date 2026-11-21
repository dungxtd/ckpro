// Upload the interface's source maps to PostHog, then drop them from the
// bundle; only when a key is given (a release build), else nothing. Node,
// not a shell line: pnpm runs scripts with cmd.exe on Windows. The CLI is
// fetched for the upload alone, not installed with the app's dependencies:
// its install script downloads a binary every build would carry and some
// runners cannot unpack.
import { spawnSync } from "node:child_process";

/** The PostHog CLI used to upload */
const CLI = "@posthog/cli@0.19.0";

if (!process.env.POSTHOG_CLI_API_KEY) process.exit(0);
const run = spawnSync(
	"pnpm",
	[
		"dlx",
		"--allow-build=@posthog/cli",
		CLI,
		"sourcemap",
		"process",
		"--directory",
		"dist",
		"--release-name",
		"ckpro",
		"--release-version",
		process.env.npm_package_version ?? "0.0.0",
		"--delete-after",
	],
	{ stdio: "inherit", shell: process.platform === "win32" }
);
process.exit(run.status ?? 1);
