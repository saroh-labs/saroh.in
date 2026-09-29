/**
 * C14 against a real Postgres: Spent is net of partial refunds and credit
 * notes, and the Customers list and Customer Detail say the same figure; Add
 * customer makes a contact only, which the list shows as added by hand.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CustomerAddService } from "./customer-add.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { CustomersListService } from "./customers-list.service";

const tag = `${process.pid}-${Date.now()}`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const list = new CustomersListService();
const details = new CustomerDetailService(availability);
const workspace = new CustomerWorkspaceService(availability);
const adds = new CustomerAddService();

let seq = 0;
const next = () => `${tag}-${++seq}`;

async function paidOrder(
    organizationId: string,
    storeId: string,
    customerId: string,
    total: string,
) {
    return (
        await prisma.order.create({
            data: {
                storeId,
                organizationId,
                customerId,
                orderId: `ORD-${next()}`,
                subtotal: total,
                total,
                currency: "INR",
                paymentStatus: "PAID",
                status: "DELIVERED",
            },
        })
    ).id;
}

async function payment(
    organizationId: string,
    target: { orderId?: string; invoiceId?: string },
    amountCents: number,
    status = "SUCCEEDED",
) {
    return (
        await prisma.paymentIntent.create({
            data: {
                organizationId,
                ...target,
                provider: "fake",
                amountCents,
                currency: "INR",
                status,
            },
        })
    ).id;
}

async function refund(
    organizationId: string,
    paymentIntentId: string,
    amountCents: number,
    extra: { status?: string; forEdit?: boolean } = {},
) {
    await prisma.paymentRefund.create({
        data: {
            organizationId,
            paymentIntentId,
            amountCents,
            currency: "INR",
            status: extra.status ?? "SUCCEEDED",
            forEdit: extra.forEdit ?? false,
        },
    });
}

async function invoice(
    organizationId: string,
    data: {
        contactId?: string;
        total: string;
        status?: string;
        kind?: string;
        orderId?: string;
        relatedInvoiceId?: string;
        source?: string;
    },
) {
    return (
        await prisma.invoice.create({
            data: {
                organizationId,
                contactId: data.contactId,
                orderId: data.orderId,
                relatedInvoiceId: data.relatedInvoiceId,
                kind: data.kind ?? "INVOICE",
                status: data.status ?? "PAID",
                source: data.source ?? "MANUAL",
                number: `INV-${next()}`,
                currency: "INR",
                subtotal: data.total,
                total: data.total,
                paidAt:
                    data.status === "PAID" || !data.status ? new Date() : null,
            },
        })
    ).id;
}

describe("Spent net of refunds, and Add customer (DB, C14)", () => {
    let org = "";
    let ctx: OrganizationContext;
    let asha = "";

    beforeAll(async () => {
        const owner = await prisma.user.create({
            data: { email: `c14-owner-${tag}@example.com` },
        });
        org = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `c14-${next()}` },
            })
        ).id;
        ctx = { organizationId: org, userId: owner.id, role: "OWNER" };
        const store = (
            await prisma.store.create({
                data: {
                    name: "Hill Road",
                    slug: `c14-store-${next()}`,
                    organizationId: org,
                },
            })
        ).id;
        asha = (
            await prisma.contact.create({
                data: {
                    organizationId: org,
                    email: "asha@example.com",
                    firstName: "Asha",
                },
            })
        ).id;
        const shopper = (
            await prisma.customer.create({
                data: {
                    storeId: store,
                    organizationId: org,
                    email: "asha@example.com",
                },
            })
        ).id;
        await workspace.link(ctx, asha, shopper);

        // An order of 1,000 with 300 handed back: 700. An edit's money back
        // already lowered the total, and a failed refund gave nothing back.
        const first = await paidOrder(org, store, shopper, "1000");
        const paid = await payment(org, { orderId: first }, 110_000);
        await refund(org, paid, 30_000);
        await refund(org, paid, 10_000, { forEdit: true });
        await refund(org, paid, 20_000, { status: "FAILED" });
        // A payment that never went through: nothing was taken, so its
        // refund row takes nothing off.
        const failed = await payment(org, { orderId: first }, 5_000, "FAILED");
        await refund(org, failed, 5_000);

        // A treatment of 500 whose 200 paid at booking came back: 300.
        const treatment = await paidOrder(org, store, shopper, "500");
        const atBooking = await invoice(org, {
            contactId: asha,
            total: "200",
            orderId: treatment,
            source: "BOOKING",
        });
        const deposit = await payment(org, { invoiceId: atBooking }, 20_000);
        await refund(org, deposit, 20_000);

        // A hand-written invoice of 1,600 with 400 credited: 1,200. A draft
        // credit note gave nothing back yet.
        const plan = await invoice(org, { contactId: asha, total: "1600" });
        await invoice(org, {
            total: "400",
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            relatedInvoiceId: plan,
        });
        await invoice(org, {
            total: "100",
            kind: "CREDIT_NOTE",
            status: "DRAFT",
            relatedInvoiceId: plan,
        });
    });

    it("counts what they paid and kept paid, on the list and the detail alike", async () => {
        const page = await list.list(ctx, { q: "asha" });
        const row = page.rows.find((r) => r.contactId === asha);
        const detail = await details.detail(ctx, asha);

        // 700 + 300 + 1,200.
        expect(row?.spent).toEqual([{ currency: "INR", amount: "2200.00" }]);
        expect(detail.stats.spent).toEqual(row?.spent);
    });

    it("sorts by Spent on the net figure", async () => {
        const bigSpender = (
            await prisma.contact.create({
                data: {
                    organizationId: org,
                    email: `big-${next()}@example.com`,
                    firstName: "Big",
                },
            })
        ).id;
        await invoice(org, { contactId: bigSpender, total: "2100" });

        const page = await list.list(ctx, { sort: "spent" });
        const ids = page.rows.map((r) => r.contactId);
        // 2,200 net beats 2,100, though Asha's gross is 3,300.
        expect(ids.indexOf(asha)).toBeLessThan(ids.indexOf(bigSpender));
    });

    it("adds a customer as a contact only, and lists them as added by hand", async () => {
        const before = await prisma.customer.count({
            where: { organizationId: org },
        });

        const { contactId } = await adds.add(ctx, {
            email: "rohan@example.com",
            firstName: "Rohan",
            phone: "+91 98450 99999",
        });

        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: contactId },
        });
        expect(contact.organizationId).toBe(org);
        expect(
            await prisma.customer.count({ where: { organizationId: org } }),
        ).toBe(before);

        const page = await list.list(ctx, { q: "rohan" });
        expect(page.rows).toHaveLength(1);
        expect(page.rows[0]).toMatchObject({
            contactId,
            name: "Rohan",
            addedByHand: true,
            orders: { count: 0, lastAt: null },
            spent: [],
        });

        const detail = await details.detail(ctx, contactId);
        expect(detail.contact.name).toBe("Rohan");
        expect(detail.orders?.rows).toEqual([]);
    });

    it("never lists a contact made elsewhere who hasn't paid", async () => {
        await prisma.contact.create({
            data: {
                organizationId: org,
                email: "lead@example.com",
                firstName: "Leela",
                source: "manual",
            },
        });
        const page = await list.list(ctx, { q: "leela" });
        expect(page.rows).toEqual([]);
    });

    it("refuses an email another contact holds, naming them", async () => {
        const err = await adds
            .add(ctx, { email: "asha@example.com", firstName: "Asha R" })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            details: { field: "email", contactId: asha, name: "Asha" },
        });
        expect(
            await prisma.contact.count({
                where: { organizationId: org, email: "asha@example.com" },
            }),
        ).toBe(1);
    });
});
