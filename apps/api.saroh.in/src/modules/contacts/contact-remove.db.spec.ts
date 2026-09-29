/**
 * DEC-042 on the server, against a real Postgres: a contact with orders or
 * invoices is never hard-deleted — the API refuses (409) with the words the
 * ⋯ menu shows, and the person stays for a privacy removal instead. A
 * contact with none still goes, and what isn't paper (an abandoned site
 * checkout, a pay-now hold's unnumbered draft) doesn't keep them.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const contacts = new ContactsService();

let ctx: OrganizationContext;
let store = "";

async function person(): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: `p-${next()}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
}

/** A store customer linked to the contact, as Customer Detail reads it. */
async function shopperOf(contactId: string): Promise<string> {
    const customerId = (
        await prisma.customer.create({
            data: {
                storeId: store,
                organizationId: ctx.organizationId,
                email: `s-${next()}@example.com`,
            },
        })
    ).id;
    await prisma.customerIdentityLink.create({
        data: { organizationId: ctx.organizationId, contactId, customerId },
    });
    return customerId;
}

async function order(
    customerId: string,
    extra: { placedOnline?: boolean; paymentStatus?: string } = {},
) {
    await prisma.order.create({
        data: {
            storeId: store,
            organizationId: ctx.organizationId,
            customerId,
            orderId: `ORD-${next()}`,
            subtotal: "500",
            total: "500",
            currency: "INR",
            paymentStatus: extra.paymentStatus ?? "PAID",
            status: "DELIVERED",
            placedOnline: extra.placedOnline ?? false,
        },
    });
}

async function invoice(
    contactId: string,
    extra: { number?: string | null; source?: string; status?: string } = {},
) {
    await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            contactId,
            kind: "INVOICE",
            status: extra.status ?? "ISSUED",
            source: extra.source ?? "MANUAL",
            number: extra.number === undefined ? `INV-${next()}` : extra.number,
            currency: "INR",
            subtotal: "1200",
            total: "1200",
        },
    });
}

const exists = async (id: string) =>
    (await prisma.contact.count({ where: { id } })) === 1;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `dec042-${next()}` },
    });
    ctx = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    store = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `dec042-store-${next()}`,
                organizationId: org.id,
            },
        })
    ).id;
});

describe("deleting a contact's record (DEC-042, real database)", () => {
    it("refuses someone with an issued invoice, and keeps them", async () => {
        const asha = await person();
        await invoice(asha);

        const refused = contacts.remove(ctx, asha);
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(refused).rejects.toMatchObject({
            response: {
                message:
                    "They have orders or invoices. Remove their details instead.",
                details: { reason: "keeps_records", orders: 0, invoices: 1 },
            },
        });
        expect(await exists(asha)).toBe(true);
    });

    it("refuses someone whose linked store customer has an order", async () => {
        const asha = await person();
        await order(await shopperOf(asha));

        await expect(contacts.remove(ctx, asha)).rejects.toMatchObject({
            response: {
                details: { reason: "keeps_records", orders: 1 },
            },
        });
        expect(await exists(asha)).toBe(true);
    });

    it("counts a voided invoice: it is still paper", async () => {
        const asha = await person();
        await invoice(asha, { status: "VOID" });

        await expect(contacts.remove(ctx, asha)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(await exists(asha)).toBe(true);
    });

    it("deletes someone with no orders or invoices", async () => {
        const asha = await person();
        await shopperOf(asha);

        await expect(contacts.remove(ctx, asha)).resolves.toMatchObject({
            id: asha,
            deleted: true,
        });
        expect(await exists(asha)).toBe(false);
    });

    it("deletes someone whose only order is an abandoned site checkout, or whose only invoice is a pay-now hold", async () => {
        const asha = await person();
        await order(await shopperOf(asha), {
            placedOnline: true,
            paymentStatus: "UNPAID",
        });
        await invoice(asha, {
            number: null,
            source: "BOOKING",
            status: "DRAFT",
        });

        await contacts.remove(ctx, asha);
        expect(await exists(asha)).toBe(false);
    });
});
