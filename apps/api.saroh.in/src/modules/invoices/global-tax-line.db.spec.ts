/**
 * A Global business's named tax (DEC-204), against a real Postgres: a manual
 * invoice takes it, and paper for money already agreed never does.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "./invoices.service";

const invoices = new InvoicesService();
const tag = `${process.pid}-${Date.now()}`;
let owner: OrganizationContext;
let contactId: string;

const LINES = [{ description: "Design", quantity: 2, unitPrice: "100" }];

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Global Tax Ltd",
            slug: `global-tax-${tag}`,
            edition: "GLOBAL",
            currency: "GBP",
        },
    });
    const user = await prisma.user.create({
        data: { email: `global-tax-${tag}@example.com` },
    });
    owner = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        edition: "GLOBAL",
    };
    await giveBusinessDetails(org.id);
    await prisma.businessProfile.update({
        where: { organizationId: org.id },
        data: {
            country: "GB",
            gstState: null,
            taxId: "GB123456789",
            taxName: "VAT",
            taxRate: "20",
        },
    });
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: `client-${tag}@example.com`,
                firstName: "Client",
            },
        })
    ).id;
});

const stored = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id } });

describe("a manual invoice", () => {
    it("adds the named tax, and freezes it with the tax number", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "GBP",
            tax: "0",
            lines: LINES,
        });
        const issued = await invoices.issue(owner, draft.id);
        const row = await stored(issued.id);
        expect(row.subtotal.toString()).toBe("200");
        expect(row.tax.toString()).toBe("40");
        expect(row.total.toString()).toBe("240");
        expect(row.taxLabel).toBe("VAT 20%");
        expect(row.sellerTaxId).toBe("GB123456789");
        expect(row.sellerGstin).toBeNull();
    });

    it("keeps them when it's written again", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "GBP",
            lines: LINES,
        });
        const issued = await invoices.issue(owner, draft.id);
        await invoices.voidInvoice(owner, issued.id, {
            reason: "Wrong client",
        } as never);
        const again = await invoices.writeAgain(owner, issued.id);
        expect((await stored(again.id)).taxLabel).toBe("VAT 20%");
    });

    it("drops the old amount once the tax is cleared", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "GBP",
            lines: LINES,
        });
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: { taxName: null, taxRate: null },
        });
        try {
            const updated = await invoices.updateDraft(owner, draft.id, {
                lines: LINES,
            });
            const row = await stored(updated.id);
            expect(row.tax.toString()).toBe("0");
            expect(row.total.toString()).toBe("200");
            expect(row.taxLabel).toBeNull();
        } finally {
            await prisma.businessProfile.update({
                where: { organizationId: owner.organizationId },
                data: { taxName: "VAT", taxRate: "20" },
            });
        }
    });
});

describe("paper for money already agreed", () => {
    it("takes no tax when a subscription's draft is issued", async () => {
        const draft = await prisma.invoice.create({
            data: {
                organizationId: owner.organizationId,
                status: "DRAFT",
                source: "SUBSCRIPTION",
                contactId,
                currency: "GBP",
                subtotal: "200",
                tax: "0",
                total: "200",
                lines: {
                    create: {
                        organizationId: owner.organizationId,
                        description: "Plan",
                        quantity: 1,
                        unitPrice: "200",
                        amount: "200",
                        position: 0,
                    },
                },
            },
        });
        await invoices.issue(owner, draft.id);
        const row = await stored(draft.id);
        expect(row.tax.toString()).toBe("0");
        expect(row.total.toString()).toBe("200");
        expect(row.taxLabel).toBeNull();
        expect(row.sellerTaxId).toBeNull();
    });

    it("takes no tax when the system issues one", async () => {
        const made = await prisma.$transaction((tx) =>
            invoices.issueInTx(tx as never, owner.organizationId, {
                contactId,
                currency: "GBP",
                source: "SUBSCRIPTION",
                lines: [
                    { description: "Renewal", quantity: 1, unitPrice: "100" },
                ],
            } as never),
        );
        const row = await stored(made.id);
        expect(row.tax.toString()).toBe("0");
        expect(row.total.toString()).toBe("100");
        expect(row.taxLabel).toBeNull();
    });
});
