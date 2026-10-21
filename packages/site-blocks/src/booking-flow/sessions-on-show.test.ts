import { describe, expect, it } from "vitest";

import { SESSIONS_SHOWN, sessionsOnShow } from "./use-times";

const at = (n: number) => ({
    startAt: `2026-10-${String(n).padStart(2, "0")}T05:30:00.000Z`,
});
const sessions = Array.from({ length: 25 }, (_, i) => at(i + 1));

describe("sessionsOnShow", () => {
    it("shows the first page when nothing is chosen", () => {
        expect(sessionsOnShow(sessions, SESSIONS_SHOWN, null)).toBe(
            SESSIONS_SHOWN,
        );
    });

    it("keeps the page when the chosen session is on it", () => {
        expect(sessionsOnShow(sessions, SESSIONS_SHOWN, at(4).startAt)).toBe(
            SESSIONS_SHOWN,
        );
    });

    it("opens far enough to show a session chosen by the address (#1149)", () => {
        expect(sessionsOnShow(sessions, SESSIONS_SHOWN, at(18).startAt)).toBe(
            18,
        );
    });

    it("never closes what Show more opened", () => {
        expect(sessionsOnShow(sessions, 20, at(3).startAt)).toBe(20);
    });

    it("ignores a chosen time that isn't in the list", () => {
        expect(
            sessionsOnShow(
                sessions,
                SESSIONS_SHOWN,
                "2027-01-01T00:00:00.000Z",
            ),
        ).toBe(SESSIONS_SHOWN);
    });
});
