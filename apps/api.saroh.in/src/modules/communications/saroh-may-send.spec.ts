// The one rule for Saroh sending a business's email (DEC-086), every
// switch on its own. Nothing touches a database: the provider read is a
// stub, the flags and the platform count are injected.
const mockEnv: Record<string, string | undefined> = {};
jest.mock("../../env", () => ({ env: mockEnv }));

import type { Prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { FlagKey } from "../feature-flags/flags";
import type { SarohDeps } from "./saroh-may-send";
import {
    allowancePaused,
    emailRoute,
    sarohDailyCeiling,
    sarohDecision,
    sarohMaySend,
    sarohRefusal,
    sarohRoomLeft,
    sarohSwitchesOn,
} from "./saroh-may-send";

function db(status: string | null = null) {
    return {
        communicationProvider: {
            findUnique: jest.fn().mockResolvedValue(status ? { status } : null),
        },
    } as unknown as Pick<Prisma.TransactionClient, "communicationProvider">;
}

/** A made-up allowance row: on, 5 a month. */
const ROW = {
    moduleId: "saroh-emails",
    state: "on",
    limit: 5,
    per: "month",
} as unknown as ModuleAccess;

function deps(
    over: {
        flag?: boolean;
        enforced?: boolean;
        queued?: number;
        row?: ModuleAccess | null;
        used?: number;
    } = {},
): SarohDeps {
    return {
        flags: {
            isEnabled: jest.fn((key: string) =>
                Promise.resolve(
                    key === FlagKey.PLAN_ENFORCEMENT
                        ? (over.enforced ?? true)
                        : key === FlagKey.SAROH_BUSINESS_EMAIL
                          ? (over.flag ?? true)
                          : false,
                ),
            ),
        },
        queuedSince: jest.fn().mockResolvedValue(over.queued ?? 0),
        allowance: jest
            .fn()
            .mockResolvedValue(over.row === undefined ? ROW : over.row),
        used: jest.fn().mockResolvedValue(over.used ?? 0),
    };
}

const NOW = new Date("2026-10-06T10:00:00Z");

beforeEach(() => {
    for (const k of Object.keys(mockEnv)) delete mockEnv[k];
});

describe("sarohMaySend (DEC-086)", () => {
    it("says yes with no provider, a booking notice and every switch on", async () => {
        for (const t of [
            "BOOKING_CONFIRMED",
            "BOOKING_MOVED",
            "BOOKING_CANCELLED",
        ]) {
            expect(await sarohMaySend(db(), "org_1", t, NOW, deps())).toBe(
                true,
            );
        }
    });

    it("treats a disconnected provider as none", async () => {
        expect(
            await sarohMaySend(
                db("DISABLED"),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps(),
            ),
        ).toBe(true);
    });

    it("leaves a connected provider to send it", async () => {
        expect(
            await sarohRefusal(
                db("CONNECTED"),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps(),
            ),
        ).toBe("PROVIDER_CONNECTED");
    });

    it("sends nothing but the booking notices", async () => {
        for (const t of [
            "ORDER_READY",
            "ORDER_HANDED_OVER",
            "WAITLIST_OFFER",
            "INVOICE_SENT",
        ]) {
            expect(await sarohRefusal(db(), "org_1", t, NOW, deps())).toBe(
                "NOT_A_BOOKING_NOTICE",
            );
        }
    });

    it("stops for everyone with the global stop, whatever the business's flag", async () => {
        mockEnv.SAROH_BUSINESS_EMAIL_STOP = "true";
        expect(
            await sarohRefusal(db(), "org_1", "BOOKING_CONFIRMED", NOW, deps()),
        ).toBe("STOPPED");
        expect(await sarohSwitchesOn("org_1", deps())).toBe(false);
        mockEnv.SAROH_BUSINESS_EMAIL_STOP = "false";
        expect(await sarohSwitchesOn("org_1", deps())).toBe(true);
    });

    it("needs the business's own switch on", async () => {
        expect(
            await sarohRefusal(
                db(),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps({ flag: false }),
            ),
        ).toBe("SWITCHED_OFF");
        expect(await sarohSwitchesOn("org_1", deps({ flag: false }))).toBe(
            false,
        );
    });

    it("never sends unmetered: enforcement off reads as no allowance row", async () => {
        // `enforcedRowOrThrow` is null with enforcement off; the rule reads
        // PLAN_ENFORCEMENT only through it, never a second time itself.
        const d = deps({ row: null });
        expect(
            await sarohRefusal(db(), "org_1", "BOOKING_CONFIRMED", NOW, d),
        ).toBe("NO_ALLOWANCE");
        expect(d.flags.isEnabled).not.toHaveBeenCalledWith(
            FlagKey.PLAN_ENFORCEMENT,
            "org_1",
        );
    });

    it("a plan that can't be read is a failed lookup, never sent", async () => {
        const d = deps();
        (d.allowance as jest.Mock).mockRejectedValue(new Error("down"));
        expect(
            await sarohDecision(db(), "org_1", "BOOKING_CONFIRMED", NOW, d),
        ).toEqual({ refusal: "LOOKUP_FAILED", allowance: null });
    });

    it("hands back the allowance row it read, to count against", async () => {
        expect(
            await sarohDecision(
                db(),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps(),
            ),
        ).toEqual({ refusal: null, allowance: ROW });
    });

    it("takes the provider as read when told, and doesn't read it again", async () => {
        const connected = db("CONNECTED");
        expect(
            await sarohDecision(
                connected,
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps(),
                { providerConnected: false },
            ),
        ).toEqual({ refusal: null, allowance: ROW });
        expect(
            connected.communicationProvider.findUnique,
        ).not.toHaveBeenCalled();
    });

    it("stops at the platform's daily ceiling, counted over the last 24 hours", async () => {
        const d = deps({ queued: 1_000 });
        expect(
            await sarohRefusal(db(), "org_1", "BOOKING_CONFIRMED", NOW, d),
        ).toBe("CEILING");
        expect(d.queuedSince).toHaveBeenCalledWith(
            new Date("2026-10-05T10:00:00Z"),
        );
        expect(
            await sarohMaySend(
                db(),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps({ queued: 999 }),
            ),
        ).toBe(true);
        mockEnv.SAROH_BUSINESS_EMAIL_DAILY_CEILING = "5";
        expect(sarohDailyCeiling()).toBe(5);
        expect(
            await sarohRefusal(
                db(),
                "org_1",
                "BOOKING_CONFIRMED",
                NOW,
                deps({ queued: 5 }),
            ),
        ).toBe("CEILING");
    });

    it("falls back to the default ceiling on a value that isn't a count", () => {
        mockEnv.SAROH_BUSINESS_EMAIL_DAILY_CEILING = "lots";
        expect(sarohDailyCeiling()).toBe(1_000);
    });

    it("says no when a lookup fails (fail closed)", async () => {
        const d = deps();
        (d.flags.isEnabled as jest.Mock).mockRejectedValue(new Error("down"));
        expect(
            await sarohRefusal(db(), "org_1", "BOOKING_CONFIRMED", NOW, d),
        ).toBe("LOOKUP_FAILED");
        // At send time a failed read is not a switch turned off: it throws,
        // so the job retries instead of stopping the email for good.
        await expect(sarohSwitchesOn("org_1", d)).rejects.toThrow("down");
        const count = deps();
        (count.queuedSince as jest.Mock).mockRejectedValue(new Error("down"));
        expect(
            await sarohMaySend(db(), "org_1", "BOOKING_CONFIRMED", NOW, count),
        ).toBe(false);
    });

    it("never sends unmetered: no allowance row, no number, or the row off says no (U3)", async () => {
        for (const row of [
            null,
            { ...ROW, limit: null },
            { ...ROW, limit: 0 },
            { ...ROW, state: "locked" },
            // A soft cell counts and never refuses: unmetered, so none.
            { ...ROW, soft: true },
        ] as (ModuleAccess | null)[]) {
            expect(
                await sarohRefusal(
                    db(),
                    "org_1",
                    "BOOKING_CONFIRMED",
                    NOW,
                    deps({ row }),
                ),
            ).toBe("NO_ALLOWANCE");
        }
    });
});

describe("room in this month's allowance (U3)", () => {
    it("has room under the cap, none at it", async () => {
        expect(await sarohRoomLeft("org_1", NOW, deps({ used: 4 }))).toBe(true);
        expect(await sarohRoomLeft("org_1", NOW, deps({ used: 5 }))).toBe(
            false,
        );
    });

    it("has none without an allowance, or when the count fails", async () => {
        expect(await sarohRoomLeft("org_1", NOW, deps({ row: null }))).toBe(
            false,
        );
        expect(
            await sarohRoomLeft(
                "org_1",
                NOW,
                deps({ row: { ...ROW, limit: 0 } as ModuleAccess }),
            ),
        ).toBe(false);
        expect(
            await sarohRoomLeft(
                "org_1",
                NOW,
                deps({ row: { ...ROW, soft: true } as ModuleAccess }),
            ),
        ).toBe(false);
        const d = deps();
        (d.used as jest.Mock).mockRejectedValue(new Error("down"));
        expect(await sarohRoomLeft("org_1", NOW, d)).toBe(false);
    });
});

describe("emailRoute: who emails it, the provider read once", () => {
    it("the business's own connected provider, named, whatever the message; Saroh never asked", async () => {
        const d = deps();
        const conn = db("CONNECTED");
        (conn.communicationProvider.findUnique as jest.Mock).mockResolvedValue({
            status: "CONNECTED",
            provider: "RESEND",
        });
        expect(
            await emailRoute(conn, "org_1", "BOOKING_CONFIRMED", NOW, d),
        ).toEqual({ route: "PROVIDER", provider: "RESEND" });
        expect(d.flags.isEnabled).not.toHaveBeenCalled();
        expect(conn.communicationProvider.findUnique).toHaveBeenCalledTimes(1);
    });

    it("Saroh, with the row, for a booking notice the rule allows", async () => {
        const none = db();
        expect(
            await emailRoute(none, "org_1", "BOOKING_MOVED", NOW, deps()),
        ).toEqual({ route: "SAROH", allowance: ROW });
        expect(none.communicationProvider.findUnique).toHaveBeenCalledTimes(1);
    });

    it("nobody, with why, when the rule says no; nobody and Saroh unasked with no kind", async () => {
        expect(
            await emailRoute(
                db(),
                "org_1",
                "BOOKING_MOVED",
                NOW,
                deps({ flag: false }),
            ),
        ).toEqual({ route: null, refusal: "SWITCHED_OFF" });
        const d = deps();
        expect(await emailRoute(db(), "org_1", undefined, NOW, d)).toEqual({
            route: null,
            refusal: null,
        });
        expect(d.flags.isEnabled).not.toHaveBeenCalled();
    });
});

describe("allowancePaused: the one PAUSED line", () => {
    it("is paused at the cap and past it, not below", () => {
        expect(allowancePaused(4, 5)).toBe(false);
        expect(allowancePaused(5, 5)).toBe(true);
        expect(allowancePaused(6, 5)).toBe(true);
    });
});

describe("room with the row already read", () => {
    it("counts against the row given and doesn't read the plan", async () => {
        const d = deps({ used: 4 });
        expect(await sarohRoomLeft("org_1", NOW, d, ROW)).toBe(true);
        expect(d.allowance).not.toHaveBeenCalled();
        expect(await sarohRoomLeft("org_1", NOW, deps({ used: 5 }), ROW)).toBe(
            false,
        );
        expect(await sarohRoomLeft("org_1", NOW, deps(), null)).toBe(false);
    });
});
