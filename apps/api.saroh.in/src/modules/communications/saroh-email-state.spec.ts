// What Settings → Providers is told about Saroh sending a business's
// booking emails (DEC-086, U4): the same rule as the send, every state on
// its own. No database: the provider read is a stub, the rest injected.
const mockEnv: Record<string, string | undefined> = {};
jest.mock("../../env", () => ({ env: mockEnv }));

import type { Prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { FlagKey } from "../feature-flags/flags";
import type { SarohStateDeps } from "./saroh-email-state";
import { sarohEmailState } from "./saroh-email-state";

function db(status: string | null = null) {
    return {
        communicationProvider: {
            findUnique: jest.fn().mockResolvedValue(status ? { status } : null),
        },
    } as unknown as Pick<Prisma.TransactionClient, "communicationProvider">;
}

/** A made-up allowance row: on, 10 a month. */
const ROW = {
    moduleId: "saroh-emails",
    state: "on",
    limit: 10,
    per: "month",
} as unknown as ModuleAccess;

function deps(
    over: {
        flag?: boolean;
        enforced?: boolean;
        row?: ModuleAccess | null;
        rowFails?: boolean;
        used?: number;
        usedFails?: boolean;
        contactEmail?: string | null;
        name?: string;
    } = {},
): SarohStateDeps {
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
        queuedSince: jest.fn().mockResolvedValue(0),
        allowance: over.rowFails
            ? jest.fn().mockRejectedValue(new Error("db down"))
            : jest
                  .fn()
                  .mockResolvedValue(over.row === undefined ? ROW : over.row),
        used: over.usedFails
            ? jest.fn().mockRejectedValue(new Error("db down"))
            : jest.fn().mockResolvedValue(over.used ?? 3),
        business: jest.fn().mockResolvedValue({
            name: over.name ?? "Rye Studio",
            slug: "rye",
            contactEmail:
                over.contactEmail === undefined
                    ? "hello@rye.example"
                    : over.contactEmail,
            zone: "Asia/Kolkata",
        }),
    };
}

// 6 Oct, late evening in Kolkata; still October there.
const NOW = new Date("2026-10-06T10:00:00Z");

beforeEach(() => {
    for (const k of Object.keys(mockEnv)) delete mockEnv[k];
});

describe("sarohEmailState (DEC-086, U4)", () => {
    it("is SENDING with the month's count, the restart date, the sender and the reply address", async () => {
        expect(await sarohEmailState(db(), "org_1", NOW, deps())).toEqual({
            state: "SENDING",
            used: 3,
            cap: 10,
            resetsOn: "1 Nov",
            sender: {
                name: "Rye Studio via Saroh",
                address: "bookings@notify.saroh.in",
            },
            replyTo: "hello@rye.example",
        });
    });

    it("reads the plan's allowance once: the rule's row is the cap", async () => {
        const d = deps();
        await sarohEmailState(db(), "org_1", NOW, d);
        expect(d.allowance).toHaveBeenCalledTimes(1);
    });

    it("uses the configured from address", async () => {
        mockEnv.SAROH_BUSINESS_EMAIL_FROM = "bookings@notify.example";
        const s = await sarohEmailState(db(), "org_1", NOW, deps());
        expect(s.state === "SENDING" && s.sender.address).toBe(
            "bookings@notify.example",
        );
    });

    it("cleans the business name the way the email's display name is", async () => {
        const s = await sarohEmailState(
            db(),
            "org_1",
            NOW,
            deps({ name: "Rye https://evil.example now" }),
        );
        expect(s.state === "SENDING" && s.sender.name).toBe(
            "Rye now via Saroh",
        );
    });

    it("gives no reply address without a clean contact email", async () => {
        for (const contactEmail of [
            null,
            "not an email",
            "a@b.co\nBcc: x@y.z",
        ]) {
            const s = await sarohEmailState(
                db(),
                "org_1",
                NOW,
                deps({ contactEmail }),
            );
            expect(s.state === "SENDING" && s.replyTo).toBeNull();
        }
    });

    it("is NEAR from 80% of the allowance", async () => {
        expect(
            (await sarohEmailState(db(), "org_1", NOW, deps({ used: 8 })))
                .state,
        ).toBe("NEAR");
        expect(
            (await sarohEmailState(db(), "org_1", NOW, deps({ used: 7 })))
                .state,
        ).toBe("SENDING");
    });

    it("is PAUSED at the cap, and past it, until the month starts again", async () => {
        for (const used of [10, 12]) {
            const s = await sarohEmailState(db(), "org_1", NOW, deps({ used }));
            expect(s).toMatchObject({
                state: "PAUSED",
                used,
                cap: 10,
                resetsOn: "1 Nov",
            });
        }
    });

    it("says the restart date in the business's own month", async () => {
        // 31 Oct 20:00 UTC is already 1 Nov in Kolkata.
        const s = await sarohEmailState(
            db(),
            "org_1",
            new Date("2026-10-31T20:00:00Z"),
            deps(),
        );
        expect(s.state === "SENDING" && s.resetsOn).toBe("1 Dec");
    });

    it("is UNREAD, never a zero, when the month's count can't be read", async () => {
        expect(
            await sarohEmailState(
                db(),
                "org_1",
                NOW,
                deps({ usedFails: true }),
            ),
        ).toEqual({ state: "UNREAD" });
    });

    it("is UNREAD when the plan's allowance can't be read", async () => {
        expect(
            await sarohEmailState(db(), "org_1", NOW, deps({ rowFails: true })),
        ).toEqual({ state: "UNREAD" });
    });

    it("is OFF with enforcement off, a plan without the allowance (or a 0 or soft one), the switch off or the global stop", async () => {
        const cases: SarohStateDeps[] = [
            // Enforcement off is no row (`enforcedRowOrThrow`); the db
            // spec reads it through the real one.
            deps({ row: null }),
            deps({ row: { ...ROW, limit: null } as ModuleAccess }),
            deps({ row: { ...ROW, limit: 0 } as ModuleAccess }),
            // A soft cell would be unmetered, so it is no allowance.
            deps({ row: { ...ROW, soft: true } as ModuleAccess }),
            deps({ flag: false }),
        ];
        for (const d of cases) {
            expect(await sarohEmailState(db(), "org_1", NOW, d)).toEqual({
                state: "OFF",
                takesOver: false,
            });
        }
        mockEnv.SAROH_BUSINESS_EMAIL_STOP = "true";
        expect(await sarohEmailState(db(), "org_1", NOW, deps())).toEqual({
            state: "OFF",
            takesOver: false,
        });
    });

    it("treats a disconnected provider as none", async () => {
        expect(
            (await sarohEmailState(db("DISABLED"), "org_1", NOW, deps())).state,
        ).toBe("SENDING");
    });

    it("is OFF with its own email connected, and says whether Saroh would take over", async () => {
        expect(
            await sarohEmailState(db("CONNECTED"), "org_1", NOW, deps()),
        ).toEqual({ state: "OFF", takesOver: true });
        expect(
            await sarohEmailState(
                db("CONNECTED"),
                "org_1",
                NOW,
                deps({ flag: false }),
            ),
        ).toEqual({ state: "OFF", takesOver: false });
        // Unread: no promise that Saroh takes over.
        expect(
            await sarohEmailState(
                db("CONNECTED"),
                "org_1",
                NOW,
                deps({ rowFails: true }),
            ),
        ).toEqual({ state: "OFF", takesOver: false });
    });
});
