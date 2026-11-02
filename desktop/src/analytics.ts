import { telemetryApi } from "@/tauri/api";

/** The bundled client (its own build of PostHog) */
type PostHog = typeof import("posthog-js/dist/module.full.no-external")["default"];

/**
 * Product analytics (PostHog): anonymous usage events, errors and replays of
 * the interface. Never the candidate's own text: what they write to the
 * assistant and its answers, emails and session names are masked (`ph-mask`),
 * fields are masked, and the remote desktop (a canvas) is not recorded.
 * Off when the build has no key (`VITE_POSTHOG_KEY`) or the candidate turned
 * it off in Settings > About. Loaded only when on, so the app starts light.
 */
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
	(import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

/** The part of the page whose text replays never show */
export const MASK = "ph-mask";

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
/** Events before the client loaded (a few at most: the app opening) */
const queued: [string, Record<string, unknown>?][] = [];

async function load(): Promise<PostHog | null> {
	if (!KEY) return null;
	// Everything bundled (replay, errors): nothing is fetched from elsewhere
	const { default: posthog } = await import("posthog-js/dist/module.full.no-external");
	posthog.init(KEY, {
		api_host: HOST,
		disable_external_dependency_loading: true,
		person_profiles: "identified_only",
		// Hash routes: views are sent as the router changes (`pageView`)
		capture_pageview: false,
		capture_pageleave: true,
		capture_exceptions: true,
		// Clicks are counted, not what the clicked thing says
		mask_all_text: true,
		mask_all_element_attributes: true,
		session_recording: { maskAllInputs: true, maskTextSelector: `.${MASK}` },
	});
	return posthog;
}

/** Follow the setting: on (load and send), or off (stop, record nothing) */
export async function setAnalytics(on: boolean, properties?: Record<string, unknown>) {
	if (!on) {
		client?.opt_out_capturing();
		client?.stopSessionRecording();
		queued.length = 0;
		if (KEY) telemetryApi.configure(false, KEY, HOST);
		return;
	}
	loading ??= load();
	client = await loading;
	if (!client) return;
	if (client.has_opted_out_capturing()) client.opt_in_capturing();
	client.startSessionRecording();
	if (properties) client.register(properties);
	// The core's errors go along, as the same person and session
	telemetryApi.configure(
		true,
		KEY as string,
		HOST,
		client.get_distinct_id(),
		client.get_session_id() ?? null
	);
	for (const [event, props] of queued.splice(0)) client.capture(event, props);
}

/** One usage event; nothing when analytics are off */
export function track(event: string, properties?: Record<string, unknown>) {
	if (!KEY) return;
	if (client) client.capture(event, properties);
	else if (queued.length < 20) queued.push([event, properties]);
}

/** A screen shown (the router changed) */
export const pageView = (path: string) =>
	track("$pageview", { $current_url: `app://cktry${path}` });
