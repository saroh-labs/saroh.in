import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
    backfillPayingCustomerContacts,
    linkPayingCustomer,
    normaliseBackfillEmail,
} from "./paying-customer-contacts";

type Row = Record<string, unknown>;

/** A transaction with just what the rule reads and writes. */
function fakeTx(over: {
    link?: Row | null;
    customer?: Row | null;
    holder?: Row | null;
    account?: Row | null;
    madeCount?: number;
    linkAfterRace?: Row | null;
}) {
    const linkFindFirst = vi
        .fn()
        .mockResolvedValueOnce(over.link ?? null)
        .mockResolvedValueOnce(over.linkAfterRace ?? null);
    return {
        customerIdentityLink: {
            findFirst: linkFindFirst,
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        customer: {
            findUnique: vi.fn().mockResolvedValue(
                over.customer === undefined
                    ? {
                          email: " Asha@Example.com ",
                          firstName: "Asha",
                          lastName: " ",
                          phone: "+91 98765 43210",
                      }
                    : over.customer,
            ),
        },
        contact: {
            findFirst: vi.fn().mockResolvedValue(over.holder ?? null),
            createMany: vi
                .fn()
                .mockResolvedValue({ count: over.madeCount ?? 1 }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "contact_1" }),
        },
        customerAccount: {
            findFirst: vi.fn().mockResolvedValue(over.account ?? null),
        },
    };
}

const INPUT = {
    organizationId: "org_1",
    customerId: "cust_1",
    reason: "PAYMENT" as const,
};

const run = (tx: ReturnType<typeof fakeTx>) =>
    linkPayingCustomer(tx as never, INPUT, normaliseBackfillEmail);

describe("a contact for every paying customer (C2)", () => {
    it("makes a contact from the store customer and links it with no team member", async () => {
        const tx = fakeTx({});
        await expect(run(tx)).resolves.toBe("made");
        expect(tx.contact.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: "org_1",
                    email: "asha@example.com",
                    firstName: "Asha",
                    lastName: null,
                    phone: "+91 98765 43210",
                    source: "store-customer:cust_1",
                },
            ],
            skipDuplicates: true,
        });
        expect(tx.customerIdentityLink.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: "org_1",
                    contactId: "contact_1",
                    customerId: "cust_1",
                    reason: "PAYMENT",
                    linkedByUserId: null,
                },
            ],
            skipDuplicates: true,
        });
    });

    it("does nothing for a store customer already linked", async () => {
        const tx = fakeTx({ link: { id: "link_1" } });
        await expect(run(tx)).resolves.toBe("already-linked");
        expect(tx.contact.createMany).not.toHaveBeenCalled();
    });

    it("leaves the pair for staff when a contact already holds the email", async () => {
        const tx = fakeTx({ holder: { id: "contact_9" } });
        await expect(run(tx)).resolves.toBe("suggested");
        const [[args]] = tx.contact.findFirst.mock.calls as [
            [{ where: unknown }],
        ];
        expect(args.where).toEqual({
            organizationId: "org_1",
            email: { equals: "asha@example.com", mode: "insensitive" },
        });
        expect(tx.contact.createMany).not.toHaveBeenCalled();
        expect(tx.customerIdentityLink.createMany).not.toHaveBeenCalled();
    });

    it("leaves the pair for staff when a site account signs in with the email", async () => {
        const tx = fakeTx({ account: { id: "acct_1" } });
        await expect(run(tx)).resolves.toBe("suggested");
        expect(tx.contact.createMany).not.toHaveBeenCalled();
    });

    it("skips a store customer with no usable email", async () => {
        for (const email of ["", "  ", "removed+cust_1@removed.invalid"]) {
            const tx = fakeTx({
                customer: {
                    email,
                    firstName: null,
                    lastName: null,
                    phone: null,
                },
            });
            await expect(run(tx)).resolves.toBe("skipped");
            expect(tx.contact.createMany).not.toHaveBeenCalled();
        }
    });

    it("skips a store customer that isn't there", async () => {
        await expect(run(fakeTx({ customer: null }))).resolves.toBe("skipped");
    });

    it("finds the other payment's link when two make the contact at once", async () => {
        const tx = fakeTx({ madeCount: 0, linkAfterRace: { id: "link_2" } });
        await expect(run(tx)).resolves.toBe("already-linked");
        expect(tx.customerIdentityLink.createMany).not.toHaveBeenCalled();
    });

    it("leaves the pair when someone else's contact took the email first", async () => {
        const tx = fakeTx({ madeCount: 0 });
        await expect(run(tx)).resolves.toBe("suggested");
        expect(tx.customerIdentityLink.createMany).not.toHaveBeenCalled();
    });
});

describe("normaliseBackfillEmail", () => {
    it("trims and lower-cases", () => {
        expect(normaliseBackfillEmail("  A@B.co ")).toBe("a@b.co");
    });

    it("reads every reserved placeholder as no email", () => {
        expect(normaliseBackfillEmail("account+c1@account.invalid")).toBeNull();
        expect(normaliseBackfillEmail("merged+c1@removed.invalid")).toBeNull();
        expect(normaliseBackfillEmail("REMOVED+c1@Removed.Invalid")).toBeNull();
        expect(normaliseBackfillEmail(null)).toBeNull();
    });
});

describe("backfillPayingCustomerContacts", () => {
    it("gives each batch's transaction a minute, not Prisma's 5-second default", async () => {
        const $transaction = vi.fn().mockResolvedValue(["made"]);
        const prisma = {
            order: {
                findMany: vi
                    .fn()
                    .mockResolvedValue([{ organizationId: "org_1" }]),
            },
            customer: {
                findMany: vi
                    .fn()
                    .mockResolvedValue([{ id: "c1", createdAt: new Date() }]),
            },
            $transaction,
        } as unknown as PrismaClient;

        const report = await backfillPayingCustomerContacts(prisma);

        expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
            timeout: 60_000,
            maxWait: 10_000,
        });
        expect(report.made).toBe(1);
    });
});
