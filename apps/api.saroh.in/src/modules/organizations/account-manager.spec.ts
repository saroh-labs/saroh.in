// The rules of who brought a business in (DEC-169, U19), with the
// transaction mocked: each test says what the tables hold. The stored link,
// the CHECKs and the open-link index are `account-manager.db.spec.ts`.
import type { Prisma } from "@saroh/database";

import {
    kindOf,
    linkSetAtOf,
    managerCodeOf,
    managerFor,
    recordManagerInTx,
} from "./account-manager";

const NOW = new Date("2026-11-30T10:00:00.000Z");
const MADE_AT = NOW;
const BEFORE = new Date("2026-11-20T10:00:00.000Z");
const AFTER = new Date("2026-11-30T10:00:01.000Z");

interface Teammate {
    id: string;
    userId: string;
    code: string;
    active: boolean;
}

/** A transaction over these teammates, this owner and these leads. */
function txOver(input: {
    teammates?: Teammate[];
    owner?: {
        email: string;
        emailVerified: boolean;
        emailVerifiedByStaffAt: Date | null;
    } | null;
    leads?: {
        id: string;
        ownerPlatformAdminId: string | null;
        emailKey?: string | null;
        emailAt?: Date | null;
        signUpEmailKey?: string | null;
        signUpEmailAt?: Date | null;
    }[];
}) {
    const teammates = input.teammates ?? [];
    const tx = {
        staffProfile: {
            findUnique: jest.fn(
                ({ where }: { where: { managerCode: string } }) => {
                    const t = teammates.find(
                        (row) => row.code === where.managerCode,
                    );
                    return Promise.resolve(
                        t ? { platformAdminId: t.id } : null,
                    );
                },
            ),
        },
        platformAdmin: {
            findFirst: jest.fn(({ where }: { where: { id: string } }) => {
                const t = teammates.find((row) => row.id === where.id);
                return Promise.resolve(t?.active ? { userId: t.userId } : null);
            }),
        },
        user: {
            findUnique: jest.fn(() =>
                Promise.resolve(
                    input.owner === undefined
                        ? {
                              email: "asha@example.com",
                              emailVerified: true,
                              emailVerifiedByStaffAt: null,
                          }
                        : input.owner,
                ),
            ),
        },
        sarohLead: {
            findMany: jest.fn(() =>
                Promise.resolve(
                    (input.leads ?? []).map((lead) => ({
                        emailKey: null,
                        emailAt: null,
                        signUpEmailKey: null,
                        signUpEmailAt: null,
                        ...lead,
                    })),
                ),
            ),
        },
        accountManagerLink: { create: jest.fn().mockResolvedValue({}) },
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    return tx;
}

const asTx = (tx: ReturnType<typeof txOver>) =>
    tx as unknown as Prisma.TransactionClient;

const ASHA: Teammate = {
    id: "pa_asha",
    userId: "user_asha",
    code: "ABCD2345",
    active: true,
};
const RAVI: Teammate = {
    id: "pa_ravi",
    userId: "user_ravi",
    code: "WXYZ6789",
    active: true,
};

describe("managerCodeOf", () => {
    it("takes a code as it is read out: any case, spaces and dashes", () => {
        expect(managerCodeOf("ABCD2345")).toBe("ABCD2345");
        expect(managerCodeOf(" abcd-2345 ")).toBe("ABCD2345");
        expect(managerCodeOf("abcd 2345")).toBe("ABCD2345");
    });

    it.each([
        undefined,
        null,
        42,
        "",
        "ABCD234",
        "ABCD23456",
        // 0, 1, I, L and O are not in the alphabet.
        "ABCD0345",
        "ABCDEFGI",
        "you@example.com",
        "A".repeat(500),
    ])("is nothing for %j", (raw) => {
        expect(managerCodeOf(raw)).toBeNull();
    });
});

describe("linkSetAtOf", () => {
    it("takes the time the cookie was kept", () => {
        expect(
            linkSetAtOf("2026-11-29T09:00:00.000Z", NOW)?.toISOString(),
        ).toBe("2026-11-29T09:00:00.000Z");
    });

    it.each([
        undefined,
        "",
        "yesterday",
        // From the future, or from before Saroh's sign-up existed.
        "2027-01-01T00:00:00.000Z",
        "2020-01-01T00:00:00.000Z",
    ])("is nothing for %j", (raw) => {
        expect(linkSetAtOf(raw, NOW)).toBeNull();
    });
});

describe("kindOf", () => {
    it("is ASSIGNED only when staff gave it", () => {
        expect(kindOf("ASSIGNED")).toBe("ASSIGNED");
        expect(kindOf("LINK")).toBe("BROUGHT_IN");
        expect(kindOf("CODE")).toBe("BROUGHT_IN");
        expect(kindOf("LEAD_EMAIL")).toBe("BROUGHT_IN");
    });
});

describe("managerFor: the first proof wins", () => {
    const ask = (
        tx: ReturnType<typeof txOver>,
        claim: Parameters<typeof managerFor>[1]["claim"],
    ) =>
        managerFor(asTx(tx), {
            ownerUserId: "user_owner",
            madeAt: MADE_AT,
            claim,
            now: NOW,
        });

    it("the link, with when its cookie was kept", async () => {
        const tx = txOver({ teammates: [ASHA] });

        await expect(
            ask(tx, {
                link: { code: "abcd2345", setAt: "2026-11-29T09:00:00.000Z" },
            }),
        ).resolves.toEqual({
            platformAdminId: "pa_asha",
            source: "LINK",
            evidence: {
                source: "LINK",
                code: "ABCD2345",
                cookieSetAt: "2026-11-29T09:00:00.000Z",
            },
        });
    });

    it("a typed code", async () => {
        const tx = txOver({ teammates: [ASHA] });

        await expect(ask(tx, { code: "abcd-2345" })).resolves.toEqual({
            platformAdminId: "pa_asha",
            source: "CODE",
            evidence: { source: "CODE", code: "ABCD2345" },
        });
    });

    it("the link over a typed code, and over a lead's email", async () => {
        const tx = txOver({
            teammates: [ASHA, RAVI],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: BEFORE,
                },
            ],
        });

        const found = await ask(tx, {
            link: { code: "ABCD2345" },
            code: "WXYZ6789",
        });

        expect(found?.platformAdminId).toBe("pa_asha");
        expect(found?.source).toBe("LINK");
        // Nothing past the first proof is read.
        expect(tx.sarohLead.findMany).not.toHaveBeenCalled();
    });

    it("a typed code over a lead's email", async () => {
        const tx = txOver({
            teammates: [ASHA, RAVI],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: BEFORE,
                },
            ],
        });

        expect((await ask(tx, { code: "ABCD2345" }))?.platformAdminId).toBe(
            "pa_asha",
        );
    });

    it("a lead's email recorded before the business was made", async () => {
        const tx = txOver({
            teammates: [RAVI],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: BEFORE,
                },
            ],
        });

        await expect(ask(tx, {})).resolves.toEqual({
            platformAdminId: "pa_ravi",
            source: "LEAD_EMAIL",
            evidence: {
                source: "LEAD_EMAIL",
                leadId: "lead_1",
                leadField: "email",
                emailRecordedAt: BEFORE.toISOString(),
            },
        });
    });

    it("reads the lead by the owner's email key, recorded before the business", async () => {
        const tx = txOver({
            teammates: [RAVI],
            owner: {
                email: "Asha.Rao+shop@Gmail.com",
                emailVerified: true,
                emailVerifiedByStaffAt: null,
            },
        });

        await ask(tx, {});

        expect(tx.sarohLead.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    ownerPlatformAdminId: { not: null },
                    OR: [
                        {
                            emailKey: "asharao@gmail.com",
                            emailAt: { lt: MADE_AT },
                        },
                        {
                            signUpEmailKey: "asharao@gmail.com",
                            signUpEmailAt: { lt: MADE_AT },
                        },
                    ],
                },
            }),
        );
    });

    it("never an email recorded after the business was made", async () => {
        const tx = txOver({
            teammates: [RAVI],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: AFTER,
                },
            ],
        });

        await expect(ask(tx, {})).resolves.toBeNull();
    });

    it("never an email staff marked verified, or one not verified at all", async () => {
        const leads = [
            {
                id: "lead_1",
                ownerPlatformAdminId: "pa_ravi",
                emailKey: "asha@example.com",
                emailAt: BEFORE,
            },
        ];
        const byStaff = txOver({
            teammates: [RAVI],
            leads,
            owner: {
                email: "asha@example.com",
                emailVerified: true,
                emailVerifiedByStaffAt: BEFORE,
            },
        });
        const unverified = txOver({
            teammates: [RAVI],
            leads,
            owner: {
                email: "asha@example.com",
                emailVerified: false,
                emailVerifiedByStaffAt: null,
            },
        });

        await expect(ask(byStaff, {})).resolves.toBeNull();
        await expect(ask(unverified, {})).resolves.toBeNull();
        expect(byStaff.sarohLead.findMany).not.toHaveBeenCalled();
    });

    it("the earlier of two recordings, as a lead's sign-up email", async () => {
        const tx = txOver({
            teammates: [ASHA, RAVI],
            leads: [
                {
                    id: "lead_late",
                    ownerPlatformAdminId: "pa_asha",
                    emailKey: "asha@example.com",
                    emailAt: new Date("2026-11-25T00:00:00.000Z"),
                },
                {
                    id: "lead_early",
                    ownerPlatformAdminId: "pa_ravi",
                    signUpEmailKey: "asha@example.com",
                    signUpEmailAt: new Date("2026-11-21T00:00:00.000Z"),
                },
            ],
        });

        const found = await ask(tx, {});

        expect(found?.platformAdminId).toBe("pa_ravi");
        expect(found?.evidence).toMatchObject({
            leadId: "lead_early",
            leadField: "signUpEmail",
        });
    });

    it("skips an unknown or revoked manager's link and code for the next proof", async () => {
        const revoked = { ...ASHA, active: false };
        const tx = txOver({
            teammates: [revoked, RAVI],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: BEFORE,
                },
            ],
        });

        const found = await ask(tx, {
            link: { code: "ABCD2345" },
            code: "QRST4567",
        });

        expect(found?.source).toBe("LEAD_EMAIL");
        expect(found?.platformAdminId).toBe("pa_ravi");
    });

    it("never a revoked manager's lead", async () => {
        const tx = txOver({
            teammates: [{ ...RAVI, active: false }],
            leads: [
                {
                    id: "lead_1",
                    ownerPlatformAdminId: "pa_ravi",
                    emailKey: "asha@example.com",
                    emailAt: BEFORE,
                },
            ],
        });

        await expect(ask(tx, {})).resolves.toBeNull();
    });

    it("never the manager's own business", async () => {
        const tx = txOver({ teammates: [{ ...ASHA, userId: "user_owner" }] });

        await expect(
            ask(tx, { link: { code: "ABCD2345" } }),
        ).resolves.toBeNull();
        await expect(ask(tx, { code: "ABCD2345" })).resolves.toBeNull();
    });

    it("nobody, with nothing carried and no lead", async () => {
        await expect(
            ask(txOver({ teammates: [ASHA] }), {}),
        ).resolves.toBeNull();
    });
});

describe("recordManagerInTx", () => {
    const input = {
        organizationId: "org_1",
        ownerUserId: "user_owner",
        madeAt: MADE_AT,
    };

    it("writes the link under a savepoint, as brought in, from when the business was made", async () => {
        const tx = txOver({ teammates: [ASHA] });

        await recordManagerInTx(asTx(tx), {
            ...input,
            claim: { code: "ABCD2345" },
        });

        expect(tx.accountManagerLink.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                platformAdminId: "pa_asha",
                source: "CODE",
                kind: "BROUGHT_IN",
                evidence: { source: "CODE", code: "ABCD2345" },
                startedAt: MADE_AT,
            },
        });
        expect(tx.$executeRawUnsafe.mock.calls).toEqual([
            ["SAVEPOINT account_manager_link"],
            ["RELEASE SAVEPOINT account_manager_link"],
        ]);
    });

    it("writes nothing when nobody brought it in", async () => {
        const tx = txOver({ teammates: [ASHA] });

        await expect(
            recordManagerInTx(asTx(tx), { ...input, claim: {} }),
        ).resolves.toBeNull();
        expect(tx.accountManagerLink.create).not.toHaveBeenCalled();
    });

    it("rolls back to the savepoint and goes on when anything fails", async () => {
        const tx = txOver({ teammates: [ASHA] });
        tx.accountManagerLink.create.mockRejectedValue(
            Object.assign(new Error("asha@example.com unique"), {
                code: "P2002",
            }),
        );
        const warn = jest
            .spyOn(
                // The module's own logger is a Nest Logger.
                jest.requireActual<typeof import("@nestjs/common")>(
                    "@nestjs/common",
                ).Logger.prototype,
                "warn",
            )
            .mockImplementation(() => undefined);

        await expect(
            recordManagerInTx(asTx(tx), {
                ...input,
                claim: { code: "ABCD2345" },
            }),
        ).resolves.toBeNull();

        expect(tx.$executeRawUnsafe).toHaveBeenLastCalledWith(
            "ROLLBACK TO SAVEPOINT account_manager_link",
        );
        const logged = warn.mock.calls.map((call) => String(call[0])).join();
        expect(logged).toContain("account_manager_link_failed");
        expect(logged).toContain("code P2002");
        // Never the error's message, which can quote an email.
        expect(logged).not.toContain("example.com");
        warn.mockRestore();
    });
});
