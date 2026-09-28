/**
 * `resolveContact` against a real Postgres (C9): a tombstone resolves to
 * its survivor, a removed contact to itself marked removed, another
 * business's id to nothing — and a writer racing a merge waits on the
 * merge's lock and lands on the survivor. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import {
    reservedMergedEmail,
    reservedRemovedEmail,
} from "../contacts/contact-email";
import { InvoicesService } from "../invoices/invoices.service";
import { resolveContact } from "./resolve-contact";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

async function business(): Promise<string> {
    return (
        await prisma.organization.create({
            data: { name: "Northwind", slug: `c9-resolve-${next()}` },
        })
    ).id;
}

async function contact(organizationId: string, email = `p-${next()}@x.in`) {
    return (
        await prisma.contact.create({
            data: { organizationId, email, firstName: "Asha" },
        })
    ).id;
}

/** B made a tombstone of A's, as the merge leaves it. */
async function tombstone(organizationId: string, into: string) {
    const id = await contact(organizationId);
    await prisma.contact.update({
        where: { id },
        data: {
            email: reservedMergedEmail(id),
            firstName: null,
            mergedIntoId: into,
            mergedAt: new Date(),
        },
    });
    return id;
}

describe("resolveContact", () => {
    it("resolves a live contact to itself", async () => {
        const org = await business();
        const a = await contact(org);
        await expect(
            prisma.$transaction((tx) => resolveContact(tx, a, org)),
        ).resolves.toEqual({
            id: a,
            organizationId: org,
            mergedFrom: null,
            removed: false,
        });
    });

    it("follows a tombstone one hop to its survivor", async () => {
        const org = await business();
        const a = await contact(org);
        const b = await tombstone(org, a);
        await expect(
            prisma.$transaction((tx) => resolveContact(tx, b, org)),
        ).resolves.toEqual({
            id: a,
            organizationId: org,
            mergedFrom: b,
            removed: false,
        });
    });

    it("finds nothing in another business, or no such contact", async () => {
        const org = await business();
        const elsewhere = await business();
        const a = await contact(org);
        await expect(resolveContact(prisma, a, elsewhere)).resolves.toBeNull();
        await expect(resolveContact(prisma, "nope", org)).resolves.toBeNull();
    });

    it("resolves a removed contact to itself, marked removed, so the writer refuses", async () => {
        const org = await business();
        const gone = await contact(org);
        await prisma.contact.update({
            where: { id: gone },
            data: { email: reservedRemovedEmail(gone), firstName: null },
        });
        await expect(resolveContact(prisma, gone, org)).resolves.toMatchObject({
            id: gone,
            removed: true,
        });
    });

    it("a writer that arrives while the merge holds the lock waits, then lands on the survivor", async () => {
        const org = await business();
        const a = await contact(org);
        const b = await contact(org);
        const pack = await prisma.classPack.create({
            data: {
                organizationId: org,
                name: "10-class pack",
                credits: 10,
                validityDays: 90,
                price: "4500.00",
                currency: "INR",
                status: "ACTIVE",
            },
        });

        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let locked!: () => void;
        const holding = new Promise<void>((r) => (locked = r));

        // The merge: B locked FOR UPDATE, then made a tombstone of A's.
        const merge = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${b} FOR UPDATE`;
                locked();
                await gate;
                await tx.contact.update({
                    where: { id: b },
                    data: {
                        email: reservedMergedEmail(b),
                        mergedIntoId: a,
                        mergedAt: new Date(),
                    },
                });
            },
            { timeout: 20_000 },
        );
        await holding;

        // The late writer: a sale for B, taken before the merge committed.
        let wrote = false;
        const writer = prisma
            .$transaction(
                async (tx) => {
                    const who = await resolveContact(tx, b, org);
                    const bought = await tx.packPurchase.create({
                        data: {
                            organizationId: org,
                            packId: pack.id,
                            contactId: who!.id,
                            credits: 10,
                            price: "4500.00",
                            currency: "INR",
                            expiresAt: new Date(Date.now() + 86_400_000),
                        },
                    });
                    return bought.contactId;
                },
                { timeout: 20_000 },
            )
            .then((id) => {
                wrote = true;
                return id;
            });

        await new Promise((r) => setTimeout(r, 300));
        expect(wrote).toBe(false);
        release();
        await merge;
        await expect(writer).resolves.toBe(a);
    });

    it("an invoice the renewal job issues for a merged-away contact lands on the survivor", async () => {
        const org = await business();
        const a = await contact(org, `asha-${next()}@x.in`);
        const b = await tombstone(org, a);
        const issued = await prisma.$transaction((tx) =>
            new InvoicesService().issueInTx(tx, org, {
                contactId: b,
                currency: "INR",
                lines: [
                    { description: "Monthly", quantity: 1, unitPrice: "1600" },
                ],
                source: "SUBSCRIPTION",
            }),
        );
        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: issued.id },
            select: { contactId: true, billToName: true },
        });
        expect(invoice).toEqual({ contactId: a, billToName: "Asha" });
    });
});
