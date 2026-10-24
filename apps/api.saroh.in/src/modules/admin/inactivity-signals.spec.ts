import type { BusinessFacts } from "./inactivity-signals";
import { signalsFor, TRADING_MODULES } from "./inactivity-signals";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-24T06:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const facts = (overrides: Partial<BusinessFacts> = {}): BusinessFacts => ({
    createdAt: ago(60),
    lifecycleStatus: "ACTIVE",
    lastActiveAt: ago(1),
    trades: true,
    lastTradeAt: ago(1),
    paymentsDisconnected: false,
    ...overrides,
});

const kinds = (f: BusinessFacts) => [...signalsFor(f, NOW).keys()];

describe("signalsFor (#1199)", () => {
    it("flags nothing for a busy business", () => {
        expect(kinds(facts())).toEqual([]);
    });

    it("flags no team activity after 7 days, since the last action", () => {
        expect(signalsFor(facts({ lastActiveAt: ago(8) }), NOW)).toEqual(
            new Map([["NO_ACTIVITY", ago(8)]]),
        );
        expect(kinds(facts({ lastActiveAt: ago(6) }))).toEqual([]);
    });

    it("counts a business that never acted as quiet since it was made", () => {
        expect(
            signalsFor(facts({ createdAt: ago(9), lastActiveAt: null }), NOW),
        ).toEqual(
            new Map([
                ["NO_ACTIVITY", ago(9)],
                // Under 14 days old: not yet untraded.
            ]),
        );
    });

    it("flags no booking or order after 14 days, only when it trades", () => {
        expect(kinds(facts({ lastTradeAt: ago(15) }))).toEqual(["NO_TRADING"]);
        expect(kinds(facts({ lastTradeAt: ago(13) }))).toEqual([]);
        expect(kinds(facts({ lastTradeAt: null, trades: false }))).toEqual([]);
        expect(kinds(facts({ lastTradeAt: null }))).toEqual(["NO_TRADING"]);
    });

    it("flags a disconnected payment provider", () => {
        expect(signalsFor(facts({ paymentsDisconnected: true }), NOW)).toEqual(
            new Map([["PAYMENT_DISCONNECTED", NOW]]),
        );
    });

    it("never flags a business under 7 days old, or one not active", () => {
        const quiet = {
            lastActiveAt: null,
            lastTradeAt: null,
            paymentsDisconnected: true,
        };
        expect(kinds(facts({ ...quiet, createdAt: ago(3) }))).toEqual([]);
        expect(
            kinds(facts({ ...quiet, lifecycleStatus: "SUSPENDED" })),
        ).toEqual([]);
    });

    it("counts a class-only business as one that trades", () => {
        // Course seats and class-pack classes are Booking rows, so the
        // booking read covers them once the module counts.
        expect(TRADING_MODULES).toEqual(
            expect.arrayContaining(["COURSES", "CLASS_PACKS"]),
        );
    });
});
