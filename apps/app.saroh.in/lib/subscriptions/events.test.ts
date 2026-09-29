import { describe, expect, it } from "vitest";

import { changeRows, changeWhat, changeWho } from "./events";
import type { SubscriptionEvent } from "./service";

const NOW = new Date("2026-10-05T06:30:00Z");
const TZ = "Asia/Kolkata";
const SUB = {
    id: "s1",
    timezone: TZ,
    contact: { id: "c1", name: "Meera Iyer", email: "meera@example.in" },
};

const event = (over: Partial<SubscriptionEvent> = {}): SubscriptionEvent => ({
    id: "e1",
    kind: "PAUSED",
    actor: { kind: "TEAM", userId: "u_priya", name: "Priya" },
    invoice: null,
    note: null,
    data: {},
    createdAt: "2026-10-01T05:00:00.000Z",
    ...over,
});

const what = (over: Partial<SubscriptionEvent>) =>
    changeWhat(event(over), SUB, NOW);

const LOAF = {
    id: "p2",
    name: "Loaf and beans",
    price: "1500.00",
    currency: "INR",
    interval: "MONTH",
};

describe("changeWhat", () => {
    it("says each action in the merchant's words", () => {
        expect(
            what({
                kind: "SUBSCRIBED",
                data: {
                    plan: {
                        ...LOAF,
                        name: "Sourdough weekly",
                        price: "1200.00",
                    },
                    startsAt: null,
                },
            }),
        ).toBe("Started on Sourdough weekly at ₹1,200");
        expect(what({ kind: "PAUSED" })).toBe("Paused");
        expect(what({ kind: "PAUSED", data: { until: null } })).toBe("Paused");
        // D8: until the start of 20 Oct, Kolkata.
        expect(
            what({
                kind: "PAUSED",
                data: { until: "2026-10-19T18:30:00.000Z" },
            }),
        ).toBe("Paused until 20 Oct");
        expect(what({ kind: "RESUMED", data: { extendedDays: 5 } })).toBe(
            "Resumed — the paid period moved 5 days later",
        );
        expect(what({ kind: "RESUMED", data: { extendedDays: 0 } })).toBe(
            "Resumed",
        );
        expect(what({ kind: "CANCELLED" })).toBe("Cancelled");
        expect(
            what({
                kind: "CANCEL_SCHEDULED",
                data: { endsAt: "2026-10-31T18:30:00.000Z" },
            }),
        ).toBe("Cancelled — ends 1 Nov");
        expect(what({ kind: "KEPT" })).toBe("Kept going — no longer ending");
        expect(what({ kind: "ENDED" })).toBe("Ended with its period");
    });

    it("names the plans in a plan change", () => {
        expect(
            what({
                kind: "PLAN_CHANGE_BOOKED",
                data: { to: LOAF, from: "2026-10-19T18:30:00.000Z" },
            }),
        ).toBe("Switching to Loaf and beans (₹1,500) from 20 Oct");
        expect(what({ kind: "PLAN_CHANGE_CANCELLED" })).toBe(
            "Cancelled the plan change",
        );
        expect(what({ kind: "PLAN_CHANGED", data: { to: LOAF } })).toBe(
            "Moved to Loaf and beans (₹1,500)",
        );
    });

    it("says a skip by its day, and a new collection day", () => {
        expect(
            what({ kind: "COLLECTION_SKIPPED", data: { date: "2026-10-10" } }),
        ).toBe("Skipped Sat 10 Oct");
        expect(
            what({
                kind: "COLLECTION_UNSKIPPED",
                data: { date: "2026-10-10" },
            }),
        ).toBe("Un-skipped Sat 10 Oct");
        expect(
            what({ kind: "COLLECTION_CHANGED", data: { weekday: [6, 3] } }),
        ).toBe("Collects on Wednesdays now");
        expect(
            what({ kind: "COLLECTION_CHANGED", data: { weekday: [6, null] } }),
        ).toBe("Stopped collections");
        expect(
            what({ kind: "COLLECTION_CHANGED", data: { note: ["a", "b"] } }),
        ).toBe("Changed the collection note");
    });

    it("names the invoice a renewal issued, when it may be seen", () => {
        const renewed = {
            kind: "RENEWED",
            data: {
                periodStart: "2026-09-30T18:30:00.000Z",
                periodEnd: "2026-10-31T18:30:00.000Z",
            },
        };
        expect(
            what({
                ...renewed,
                invoice: { id: "i1", number: "RC/26-27/0012" },
            }),
        ).toBe("Renewed · RC/26-27/0012");
        // Without invoice:read the API leaves it out.
        expect(what(renewed)).toBe("Renewed");
        expect(what({ kind: "RENEWED", data: { uncharged: true } })).toBe(
            "Renewed — nothing charged, every collection skipped",
        );
        expect(what({ ...renewed, kind: "INVOICED" })).toBe(
            "Invoiced 1 Oct – 31 Oct",
        );
        expect(what({ kind: "RESUMED", data: { restarted: true } })).toBe(
            "Resumed — a new period started",
        );
        expect(what({ kind: "RETRIED" })).toBe("Made a new pay link");
    });

    it("has words for the kinds later units write, and for one it doesn't know", () => {
        expect(what({ kind: "RENEWAL_FAILED" })).toBe("Renewal payment failed");
        expect(what({ kind: "MANDATE_LIMIT_LOW" })).toBe(
            "Not charged — above the autopay limit",
        );
        expect(what({ kind: "SOMETHING_NEW" })).toBe("Changed");
    });

    it("says why autopay was cancelled (D20)", () => {
        const cancelled = (reason?: string) =>
            what({ kind: "MANDATE_CANCELLED", data: { reason } });
        expect(cancelled("SUBSCRIPTION_ENDED")).toBe(
            "Autopay cancelled — subscription ended",
        );
        expect(cancelled("MERGED")).toBe(
            "Autopay cancelled — customers merged",
        );
        expect(cancelled("PRIVACY_REMOVAL")).toBe(
            "Autopay cancelled — their details were removed",
        );
        expect(cancelled()).toBe("Autopay cancelled");
    });

    it("never breaks on data it didn't expect", () => {
        expect(what({ kind: "PLAN_CHANGE_BOOKED", data: { to: 3 } })).toBe(
            "Booked a plan change",
        );
        expect(what({ kind: "SUBSCRIBED", data: {} })).toBe("Started");
    });
});

describe("changeWho", () => {
    it("is You for the person looking, else the team member's name", () => {
        expect(changeWho(event(), SUB, "u_priya")).toBe("You");
        expect(changeWho(event(), SUB, "u_other")).toBe("Priya");
        expect(
            changeWho(
                event({ actor: { kind: "TEAM", userId: "gone", name: null } }),
                SUB,
                null,
            ),
        ).toBe("A team member");
    });

    it("is Saroh for the job, Saroh support for an operator, and the subscriber from their account", () => {
        expect(
            changeWho(
                event({ actor: { kind: "JOB", userId: null, name: "Saroh" } }),
                SUB,
                null,
            ),
        ).toBe("Saroh");
        expect(
            changeWho(
                event({
                    actor: {
                        kind: "OPERATOR",
                        userId: null,
                        name: "Saroh support",
                    },
                }),
                SUB,
                null,
            ),
        ).toBe("Saroh support");
        expect(
            changeWho(
                event({
                    actor: { kind: "CUSTOMER", userId: null, name: null },
                }),
                SUB,
                null,
            ),
        ).toBe("Meera, from their account");
    });
});

describe("changeRows", () => {
    it("reads what, then the day and who", () => {
        expect(changeRows([event()], SUB, "u_other", NOW)).toEqual([
            { id: "e1", what: "Paused", when: "1 Oct · Priya" },
        ]);
    });
});

describe("autopay set up by the customer (D12)", () => {
    const setUp = (source: string | null, method: string | null = "UPI") =>
        event({
            kind: "MANDATE_SET_UP",
            actor: { kind: "CUSTOMER", userId: null, name: null },
            data: { method, source },
        });

    it("says the method they picked", () => {
        expect(changeWhat(setUp("ACCOUNT"), SUB, NOW)).toBe(
            "Autopay set up with UPI",
        );
        expect(changeWhat(setUp("ACCOUNT", "EMANDATE"), SUB, NOW)).toBe(
            "Autopay set up with bank account",
        );
        expect(changeWhat(setUp("ACCOUNT", null), SUB, NOW)).toBe(
            "Autopay set up",
        );
    });

    it("says who, and where they set it up", () => {
        expect(changeWho(setUp("PRICES"), SUB, null)).toBe(
            "Meera, from the Prices page",
        );
        expect(changeWho(setUp("PAY_LINK"), SUB, null)).toBe(
            "Meera, from the pay link",
        );
        expect(changeWho(setUp("ACCOUNT"), SUB, null)).toBe(
            "Meera, from their account",
        );
        // D14: approved on the provider's page from a link staff sent.
        expect(changeWho(setUp("SETUP_LINK"), SUB, null)).toBe(
            "Meera, from a set-up link",
        );
    });

    it("says a set-up link was made, and emailed (D14), and a replaced autopay", () => {
        expect(
            what({ kind: "MANDATE_LINK_SENT", data: { method: "UPI" } }),
        ).toBe("Autopay set-up link made for UPI");
        expect(
            what({
                kind: "MANDATE_LINK_SENT",
                data: { method: "CARD", emailed: true },
            }),
        ).toBe("Autopay set-up link made for card and emailed");
        expect(
            what({ kind: "MANDATE_CANCELLED", data: { reason: "REPLACED" } }),
        ).toBe("Autopay replaced — they approved a new one");
    });
});
