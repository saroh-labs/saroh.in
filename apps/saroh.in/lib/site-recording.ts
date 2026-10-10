/**
 * Whether session replay is switched on for this deployment of saroh.in
 * (DEC-125, 10 Oct): a PostHog key and `NEXT_PUBLIC_POSTHOG_REPLAY` exactly
 * "on". Only the production Worker's `wrangler.jsonc` says so; unset or
 * anything else is off, and then the cookie notice never mentions recording
 * and the recorder is never loaded.
 *
 * On is not "recording": that still waits for the visitor to accept the
 * cookie notice, and never happens in a Saroh team browser or one that
 * sends Do Not Track or Global Privacy Control (`app/site-tags.tsx`, `startRecording` in `lib/tags.ts`).
 */
export function siteRecordingOn(settings: {
    key: string | undefined;
    replay: string | undefined;
}): boolean {
    return Boolean(settings.key) && settings.replay === "on";
}
