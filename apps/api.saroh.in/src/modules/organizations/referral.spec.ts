// The rules of who referred a business (DEC-156), with the database mocked:
// each test says what the tables hold. The stored relation is
// `referral.db.spec.ts`.
jest.mock("@saroh/database", () => ({
    outsideOrgContext: jest.fn(<T>(fn: () => T) => fn()),
    prisma: {
        organization: { findFirst: jest.fn() },
        waitlistSignup: { findUnique: jest.fn(), findFirst: jest.fn() },
        user: { findUnique: jest.fn() },
        membership: { findUnique: jest.fn() },
    },
}));

import { outsideOrgContext, prisma } from "@saroh/database";

import {
    businessByReferralCode,
    referralCodeOf,
    referringBusiness,
} from "./referral";

const organizationFindFirst = prisma.organization.findFirst as jest.Mock;
const entryByRefCode = prisma.waitlistSignup.findUnique as jest.Mock;
const entryByEmail = prisma.waitlistSignup.findFirst as jest.Mock;
const userFindUnique = prisma.user.findUnique as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const outside = outsideOrgContext as unknown as jest.Mock;

const CODE = "abcd2345";

/** The businesses there are: by referral code and by id. */
function businesses(rows: { id: string; referralCode?: string }[]): void {
    organizationFindFirst.mockImplementation(
        ({ where }: { where: { id?: string; referralCode?: string } }) => {
            const found = rows.find((row) =>
                where.id !== undefined
                    ? row.id === where.id
                    : row.referralCode === where.referralCode,
            );
            return Promise.resolve(found ? { id: found.id } : null);
        },
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    businesses([{ id: "org_rye", referralCode: CODE }]);
    entryByRefCode.mockResolvedValue(null);
    entryByEmail.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({
        email: "asha@example.com",
        emailVerified: true,
    });
    membershipFindUnique.mockResolvedValue(null);
});

describe("referralCodeOf", () => {
    it("takes a code as it is stored, trimmed and lower-cased", () => {
        expect(referralCodeOf(CODE)).toBe(CODE);
        expect(referralCodeOf("  ABCD2345 ")).toBe(CODE);
    });

    it.each([
        undefined,
        null,
        "",
        "abc",
        "abcd23456",
        // 0, 1, i, l and o are left out of the alphabet.
        "abcd0345",
        "abcdefgl",
        "abcd-345",
        12345678,
        ["abcd2345"],
        { code: CODE },
    ])("is null for %p", (raw) => {
        expect(referralCodeOf(raw)).toBeNull();
    });
});

describe("businessByReferralCode", () => {
    it("is the business whose code it is", async () => {
        await expect(businessByReferralCode(CODE)).resolves.toBe("org_rye");
    });

    it("never reads a deleted business", async () => {
        await businessByReferralCode(CODE);

        expect(organizationFindFirst).toHaveBeenCalledWith({
            where: {
                referralCode: CODE,
                lifecycleStatus: { not: "DELETED_RETAINED" },
            },
            select: { id: true },
        });
    });

    it("is null for a code no business has", async () => {
        await expect(businessByReferralCode("zzzz9999")).resolves.toBeNull();
    });

    it("asks the database nothing for a malformed code", async () => {
        await expect(businessByReferralCode("not a code")).resolves.toBeNull();
        expect(organizationFindFirst).not.toHaveBeenCalled();
    });
});

describe("referringBusiness", () => {
    const asked = (code: unknown) =>
        referringBusiness({ code, userId: "user_new" });

    it("is the business whose code the browser carried", async () => {
        await expect(asked(CODE)).resolves.toBe("org_rye");
    });

    it("reads across businesses, outside any organization's context", async () => {
        await asked(CODE);

        // The code against both tables, then the membership.
        expect(outside).toHaveBeenCalledTimes(3);
    });

    it("is nobody for an unknown code", async () => {
        await expect(asked("zzzz9999")).resolves.toBeNull();
    });

    it.each([undefined, "", "nope", 42])(
        "is nobody for the malformed code %p",
        async (code) => {
            await expect(asked(code)).resolves.toBeNull();
            expect(entryByRefCode).not.toHaveBeenCalled();
        },
    );

    it("is nobody when the person is already in the referring business", async () => {
        membershipFindUnique.mockResolvedValue({ id: "mem_1" });

        await expect(asked(CODE)).resolves.toBeNull();
        expect(membershipFindUnique).toHaveBeenCalledWith({
            where: {
                organizationId_userId: {
                    organizationId: "org_rye",
                    userId: "user_new",
                },
            },
            select: { id: true },
        });
    });

    it("never takes a waitlist entry's id for a business's code", async () => {
        // The same eight characters in both tables: it can't be told which
        // the link meant, so nobody is recorded.
        entryByRefCode.mockResolvedValue({ id: "wl_1" });

        await expect(asked(CODE)).resolves.toBeNull();
        expect(organizationFindFirst).not.toHaveBeenCalled();
    });

    it("is nobody for a waitlist entry's id that no business has", async () => {
        entryByRefCode.mockResolvedValue({ id: "wl_1" });

        await expect(asked("wxyz6789")).resolves.toBeNull();
    });

    describe("with no code that names a business", () => {
        beforeEach(() => {
            businesses([
                { id: "org_rye", referralCode: CODE },
                { id: "org_pulse" },
            ]);
            entryByEmail.mockResolvedValue({
                referredByOrganizationId: "org_pulse",
            });
        });

        it("is the business the person's waitlist entry kept", async () => {
            await expect(asked(undefined)).resolves.toBe("org_pulse");
            expect(entryByEmail).toHaveBeenCalledWith({
                where: {
                    emailKey: "asha@example.com",
                    referredByOrganizationId: { not: null },
                },
                orderBy: { createdAt: "asc" },
                select: { referredByOrganizationId: true },
            });
        });

        it("finds the entry by the address as the waitlist compares it", async () => {
            userFindUnique.mockResolvedValue({
                email: "A.Sha+shop@Gmail.com",
                emailVerified: true,
            });

            await asked(undefined);

            expect(entryByEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        emailKey: "asha@gmail.com",
                    }),
                }),
            );
        });

        it("comes after a carried code that names a business", async () => {
            await expect(asked(CODE)).resolves.toBe("org_rye");
            expect(entryByEmail).not.toHaveBeenCalled();
        });

        it("is used when the carried code names nobody", async () => {
            await expect(asked("zzzz9999")).resolves.toBe("org_pulse");
        });

        it("is not read for an account whose email isn't confirmed", async () => {
            userFindUnique.mockResolvedValue({
                email: "asha@example.com",
                emailVerified: false,
            });

            await expect(asked(undefined)).resolves.toBeNull();
            expect(entryByEmail).not.toHaveBeenCalled();
        });

        it("is nobody when that business is gone or deleted", async () => {
            businesses([{ id: "org_rye", referralCode: CODE }]);

            await expect(asked(undefined)).resolves.toBeNull();
        });

        it("is nobody when the person is already in that business", async () => {
            membershipFindUnique.mockResolvedValue({ id: "mem_1" });

            await expect(asked(undefined)).resolves.toBeNull();
        });
    });

    it("is nobody when the person has no waitlist entry and no code", async () => {
        await expect(asked(undefined)).resolves.toBeNull();
        expect(membershipFindUnique).not.toHaveBeenCalled();
    });
});
