import { afterAll, beforeAll, vi } from "vitest";

/**
 * For a test file whose words have a date in them and no `now` to pass: a
 * day this year is written without its year ("12 Oct"), so a test that
 * reads the real clock passes this year and fails the next. This holds the
 * clock (only `Date`, so timers still run) on a day in the year the
 * fixtures are written in. Call it once at the top of the file.
 */
export function pinClock(iso = "2026-10-10T06:00:00.000Z"): void {
    beforeAll(() => {
        vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
    });
    afterAll(() => {
        vi.useRealTimers();
    });
}
