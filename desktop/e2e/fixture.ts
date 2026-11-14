/**
 * The tests' `test` and `expect`: a test fails when the page throws (an
 * uncaught error) or asks the stand-in backend for a command it has no
 * reply for, even when nothing on screen shows it.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ pageErrors: undefined }>({
	pageErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on("pageerror", e => {
				// The browser's own notice that layout took two passes: no fault
				if (!e.message.startsWith("ResizeObserver loop")) errors.push(e.message);
			});
			page.on("console", m => {
				if (m.type() === "error" && m.text().startsWith("backend:")) errors.push(m.text());
			});
			await use(undefined);
			expect(errors, "errors in the page").toEqual([]);
		},
		{ auto: true },
	],
});

export type { Page } from "@playwright/test";
export { expect };
