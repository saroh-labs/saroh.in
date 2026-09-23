/**
 * Invoice numbering against a real Postgres — the two things a mock cannot
 * prove: that concurrent issues in one business get distinct numbers, and
 * that a number taken inside a caller's transaction goes back when that
 * transaction fails.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "./invoices.service";

const service = new InvoicesService();

let org: OrganizationContext;
let contactId: string;

const LINES = [
    { description: "Monthly membership", quantity: 1, unitPrice: "1200" },
];

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: {
            name: "Invoices Test Org",
            slug: `invoices-org-${process.pid}`,
        },
    });
    org = { organizationId: created.id, userId: "user_1", role: "OWNER" };
    const contact = await prisma.contact.create({
        data: {
            organizationId: created.id,
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    contactId = contact.id;
});

async function draft(): Promise<string> {
    const d = await service.createDraft(org, {
        contactId,
        currency: "INR",
        lines: LINES,
    });
    return d.id;
}

describe("invoice numbers (real database)", () => {
    it("starts a business at INV-0001 with no counter row beforehand", async () => {
        expect(
            await prisma.invoiceSequence.findUnique({
                where: {
                    organizationId_series: {
                        organizationId: org.organizationId,
                        series: "INV",
                    },
                },
            }),
        ).toBeNull();
        const issued = await service.issue(org, await draft());
        expect(issued.number).toBe("INV-0001");
        expect(issued.billTo).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
            gstin: null,
            state: null,
            address: null,
        });
        // An unregistered business: a receipt, no GST.
        expect(issued.gst).toBeNull();
    });

    it("gives concurrent issues distinct, consecutive numbers", async () => {
        const ids = await Promise.all(Array.from({ length: 8 }, () => draft()));
        const issued = await Promise.all(
            ids.map((id) => service.issue(org, id)),
        );
        const numbers = issued.map((i) => i.number).sort();
        expect(numbers).toEqual([
            "INV-0002",
            "INV-0003",
            "INV-0004",
            "INV-0005",
            "INV-0006",
            "INV-0007",
            "INV-0008",
            "INV-0009",
        ]);
    });

    it("hands the number back when the caller's transaction fails", async () => {
        await expect(
            prisma.$transaction(async (tx) => {
                await service.issueInTx(tx, org.organizationId, {
                    contactId,
                    currency: "INR",
                    lines: LINES,
                    source: "PACK",
                });
                throw new Error("the pack sale failed after invoicing");
            }),
        ).rejects.toThrow("the pack sale failed");

        const next = await prisma.$transaction((tx) =>
            service.issueInTx(tx, org.organizationId, {
                contactId,
                currency: "INR",
                lines: LINES,
                source: "PACK",
            }),
        );
        // No gap: INV-0010 was never kept.
        expect(next.number).toBe("INV-0010");
        expect(
            await prisma.invoice.count({
                where: { organizationId: org.organizationId, source: "PACK" },
            }),
        ).toBe(1);
    });

    it("lets a voided subscription period be reissued and issued", async () => {
        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: org.organizationId,
                name: "Monthly",
                price: "1200",
                currency: "INR",
                interval: "MONTH",
            },
        });
        const periodStart = new Date("2026-09-01T00:00:00Z");
        const periodEnd = new Date("2026-10-01T00:00:00Z");
        const sub = await prisma.customerSubscription.create({
            data: {
                organizationId: org.organizationId,
                planId: plan.id,
                contactId,
                price: "1200",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: periodStart,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            },
        });
        const first = await prisma.$transaction((tx) =>
            service.issueInTx(tx, org.organizationId, {
                contactId,
                currency: "INR",
                lines: LINES,
                source: "SUBSCRIPTION",
                subscriptionId: sub.id,
                periodStart,
                periodEnd,
            }),
        );

        // A second live invoice for the same period is refused by the index.
        await expect(
            prisma.$transaction((tx) =>
                service.issueInTx(tx, org.organizationId, {
                    contactId,
                    currency: "INR",
                    lines: LINES,
                    source: "SUBSCRIPTION",
                    subscriptionId: sub.id,
                    periodStart,
                    periodEnd,
                }),
            ),
        ).rejects.toThrow();

        const redraft = await service.reissue(org, first.id, {
            reason: "Wrong amount",
        });
        expect(redraft.status).toBe("DRAFT");
        expect(redraft.subscriptionId).toBe(sub.id);
        expect(redraft.reissuedFromId).toBe(first.id);

        const reissued = await service.issue(org, redraft.id);
        expect(reissued.status).toBe("ISSUED");
        expect(reissued.periodStart).toBe(periodStart.toISOString());
    });
});
