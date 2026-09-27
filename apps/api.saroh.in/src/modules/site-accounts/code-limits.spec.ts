import type { CodeCounts } from "./code-limits";
import {
    CEILINGS,
    ceilingsFor,
    challengeLikely,
    decideCodeRequest,
    DESTINATION_FAILED_TRIES_PER_DAY,
    NEW_BUSINESS_CEILINGS,
} from "./code-limits";

const NOW = new Date("2026-10-09T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const S = 1_000;
const M = 60 * S;
const H = 60 * M;

function counts(over: Partial<CodeCounts> = {}): CodeCounts {
    return {
        own: [],
        destinationToday: 0,
        destinationLatest: null,
        destinationFailedToday: 0,
        businessNewLastHour: 0,
        businessToday: 0,
        ...over,
    };
}

function decide(
    over: Partial<CodeCounts> = {},
    newDestination = false,
    addressBusy = false,
) {
    return decideCodeRequest({
        counts: counts(over),
        newDestination,
        ceilings: CEILINGS,
        addressBusy,
        now: NOW,
    });
}

describe("decideCodeRequest — the visitor's own limits", () => {
    it("sends a first code with no challenge", () => {
        expect(decide()).toEqual({
            kind: "send",
            challenge: false,
            alerts: [],
        });
    });

    it("refuses a resend inside 30 seconds, saying when", () => {
        expect(decide({ own: [ago(10 * S)] })).toEqual({
            kind: "refuse",
            retryAfterSeconds: 20,
        });
        expect(decide({ own: [ago(31 * S)] }).kind).toBe("send");
    });

    it("refuses the 6th code in an hour, until the oldest leaves the hour", () => {
        const own = [
            ago(50 * M),
            ago(40 * M),
            ago(30 * M),
            ago(20 * M),
            ago(M),
        ];
        expect(decide({ own })).toEqual({
            kind: "refuse",
            retryAfterSeconds: 10 * 60,
        });
    });

    it("refuses the 11th code in a day with the longer wait", () => {
        const own = Array.from({ length: 10 }, (_, i) => ago((i + 2) * H));
        const decision = decide({ own });
        expect(decision.kind).toBe("refuse");
        // The oldest, 11 hours ago, leaves the day in 13 hours.
        expect(decision).toMatchObject({ retryAfterSeconds: 13 * 60 * 60 });
    });
});

describe("decideCodeRequest — a flooded email", () => {
    it("never refuses the 21st code of the day: a wait, then the challenge", () => {
        const flooded = { destinationToday: 20, destinationLatest: ago(3 * M) };
        expect(decide(flooded)).toEqual({
            kind: "wait",
            retryAfterSeconds: 7 * 60,
        });
        expect(
            decide({ destinationToday: 20, destinationLatest: ago(10 * M) }),
        ).toEqual({ kind: "send", challenge: true, alerts: [] });
    });

    it("waits at most 10 minutes for a customer on a fresh address", () => {
        const decision = decide({
            destinationToday: 57,
            destinationLatest: ago(1 * S),
        });
        expect(decision.kind).toBe("wait");
        expect(
            (decision as { retryAfterSeconds: number }).retryAfterSeconds,
        ).toBeLessThanOrEqual(600);
    });

    it("lets the visitor's own refusal speak first", () => {
        expect(
            decide({
                own: [ago(5 * S)],
                destinationToday: 30,
                destinationLatest: ago(5 * S),
            }).kind,
        ).toBe("refuse");
    });
});

describe("decideCodeRequest — the business's ceilings", () => {
    const half = CEILINGS.newDestinationsPerHour / 2;

    it("asks a new email for the challenge past half the new-email ceiling", () => {
        expect(decide({ businessNewLastHour: half - 1 }, true)).toEqual({
            kind: "send",
            challenge: false,
            alerts: [],
        });
        expect(decide({ businessNewLastHour: half }, true)).toEqual({
            kind: "send",
            challenge: true,
            alerts: [],
        });
    });

    it("still sends past the whole ceiling, with the challenge and an alert", () => {
        expect(
            decide(
                { businessNewLastHour: CEILINGS.newDestinationsPerHour + 40 },
                true,
            ),
        ).toEqual({
            kind: "send",
            challenge: true,
            alerts: ["new-destinations"],
        });
    });

    it("asks a returning customer for the same challenge, so it never tells whether the email has an account (review A-1)", () => {
        for (const businessNewLastHour of [
            half - 1,
            half,
            CEILINGS.newDestinationsPerHour * 3,
        ]) {
            const known = decide({ businessNewLastHour }, false);
            const unknown = decide({ businessNewLastHour }, true);
            expect(known.kind).toBe("send");
            expect((known as { challenge: boolean }).challenge).toBe(
                (unknown as { challenge: boolean }).challenge,
            );
        }
        expect(
            decide({
                businessNewLastHour: CEILINGS.newDestinationsPerHour * 3,
            }),
        ).toEqual({ kind: "send", challenge: true, alerts: [] });
    });

    it("challenges everyone past the daily ceiling and alerts, never refuses", () => {
        expect(decide({ businessToday: CEILINGS.codesPerDay })).toEqual({
            kind: "send",
            challenge: true,
            alerts: ["daily"],
        });
    });
});

describe("decideCodeRequest — what someone else did never refuses", () => {
    it("asks a busy visitor address for the challenge instead of refusing (review A-2)", () => {
        expect(decide({}, false, true)).toEqual({
            kind: "send",
            challenge: true,
            alerts: [],
        });
    });

    it("asks for the challenge and alerts once an email's codes have been guessed at 25 times today (review A-3)", () => {
        expect(
            decide({
                destinationFailedToday: DESTINATION_FAILED_TRIES_PER_DAY - 1,
            }),
        ).toEqual({ kind: "send", challenge: false, alerts: [] });
        expect(
            decide({
                destinationFailedToday: DESTINATION_FAILED_TRIES_PER_DAY,
            }),
        ).toEqual({ kind: "send", challenge: true, alerts: ["failed-tries"] });
    });
});

describe("ceilingsFor", () => {
    it("gives a business in its first 14 days the lower ceilings", () => {
        expect(ceilingsFor(ago(3 * 24 * H), NOW)).toBe(NEW_BUSINESS_CEILINGS);
        expect(ceilingsFor(ago(15 * 24 * H), NOW)).toBe(CEILINGS);
    });
});

describe("challengeLikely", () => {
    it("is true past half the new-email ceiling or past the daily one", () => {
        expect(challengeLikely(0, 0, CEILINGS)).toBe(false);
        expect(
            challengeLikely(CEILINGS.newDestinationsPerHour / 2, 0, CEILINGS),
        ).toBe(true);
        expect(challengeLikely(0, CEILINGS.codesPerDay, CEILINGS)).toBe(true);
    });
});
