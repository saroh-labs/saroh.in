import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";

import type { RunMarks } from "../../../common/test-run";
import { isTestRun } from "../../../common/test-run";
import { declaredNodeEnv, env } from "../../../env";
import { FakeGoogleCalendar } from "./fake-google-calendar";
import { GoogleCalendarClient } from "./google-calendar.client";
import type { GoogleCalendarPort } from "./google-calendar.port";
import { GOOGLE_CALENDAR } from "./google-calendar.port";

const logger = new Logger("GoogleCalendar");

/**
 * Whether the test-only fake runs: `GOOGLE_CALENDAR_FAKE=1`, honoured only
 * in a test run (`common/test-run.ts`); `env.ts` refuses it at boot under
 * NODE_ENV=production besides.
 */
export function googleFakeAllowed(
    value: string | undefined,
    run: RunMarks,
): boolean {
    return value === "1" && isTestRun(run);
}

/**
 * The Google client for this instance: the fake under the test switch,
 * the real one with Saroh's Google client keys (the same ones sign-in
 * uses, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`), or null with one WARN
 * at boot. Null is a degraded path, not an error: connecting answers 503
 * and the jobs do nothing.
 */
export function createGoogleCalendar(): GoogleCalendarPort | null {
    if (
        googleFakeAllowed(env.GOOGLE_CALENDAR_FAKE, {
            nodeEnvs: [declaredNodeEnv, env.NODE_ENV],
            ci: env.CI,
        })
    ) {
        logger.warn(
            "google_calendar_fake: Google Calendar runs on an in-memory fake, never Google (GOOGLE_CALENDAR_FAKE, test only)",
        );
        return new FakeGoogleCalendar();
    }
    if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
        const missing = [
            env.AUTH_GOOGLE_ID ? null : "AUTH_GOOGLE_ID",
            env.AUTH_GOOGLE_SECRET ? null : "AUTH_GOOGLE_SECRET",
        ].filter(Boolean);
        logger.warn(
            `google_calendar_off missing=${missing.join(",")}: Google Calendar can't be connected`,
        );
        return null;
    }
    return new GoogleCalendarClient({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
    });
}

/** Nest provider exposing the port (or null, off) under {@link GOOGLE_CALENDAR}. */
export const googleCalendarProvider: Provider = {
    provide: GOOGLE_CALENDAR,
    useFactory: createGoogleCalendar,
};
