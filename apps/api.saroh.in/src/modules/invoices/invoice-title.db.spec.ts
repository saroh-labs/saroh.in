/**
 * D15 against a real Postgres: a GST-registered clinic's exempt paper reads
 * "Bill of supply" in the list (which reads one line per invoice, so the
 * title comes from its own query over the rates), on the detail, on the pay
 * link's paper, and not on a paper with a taxed line or a rate never set.
 * A credit note against it reads "Credit note" and prints no tax columns.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { invoicePaper } from "../payments/public-invoices.service";
import { InvoicesService } from "./invoices.service";

const service = new InvoicesService();
const GSTIN = "29AAGCK1234M1Z5";

let org: OrganizationContext;
let contactId: string;
let seq = 0;

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: {
            name: "Kavi Test Clinic",
            slug: `bill-of-supply-${process.pid}`,
        },
    });
    org = { organizationId: created.id, userId: "user_1", role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: created.id,
            gstRegistered: true,
            gstState: "29",
            taxId: GSTIN,
            invoicePrefix: "KD",
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: created.id,
            email: "vikram@example.com",
            firstName: "Vikram",
            lastName: "R",
        },
    });
    contactId = contact.id;
});

/** An issued paper as the clinic's seed writes it: every figure frozen. */
async function issued(rates: (string | null)[]): Promise<string> {
    seq += 1;
    const inv = await prisma.invoice.create({
        data: {
            organizationId: org.organizationId,
            contactId,
            number: `KD/26-27/${String(seq).padStart(4, "0")}`,
            status: "ISSUED",
            issuedAt: new Date("2026-09-05T05:00:00Z"),
            dueAt: new Date("2999-01-01T00:00:00Z"),
            billToName: "Vikram R",
            billToEmail: "vikram@example.com",
            sellerGstin: GSTIN,
            sellerState: "29",
            placeOfSupply: "29",
            taxType: "INTRA",
            currency: "INR",
            subtotal: "900.00",
            tax: "0.00",
            total: String(900 * rates.length),
            lines: {
                create: rates.map((gstRate, position) => ({
                    organizationId: org.organizationId,
                    position,
                    description: `Treatment ${position + 1}`,
                    quantity: 1,
                    unitPrice: "900.00",
                    amount: "900.00",
                    hsnSac: "9993",
                    gstRate,
                    taxableValue: "900.00",
                })),
            },
        },
    });
    return inv.id;
}

describe("bill of supply (real database)", () => {
    let exempt: string;
    let mixed: string;
    let unset: string;

    beforeAll(async () => {
        exempt = await issued(["0", "0", "0"]);
        mixed = await issued(["0", "18"]);
        unset = await issued(["0", null, "0"]);
    });

    it("titles each listed paper from all of its lines, sending none", async () => {
        const list = await service.list(org, {});
        const byId = new Map(list.map((i) => [i.id, i]));
        expect(byId.get(exempt)).toMatchObject({
            title: "Bill of supply",
            exempt: true,
            summary: { lineCount: 3 },
        });
        expect(byId.get(exempt)!.lines).toBeUndefined();
        expect(byId.get(mixed)).toMatchObject({
            title: "Tax invoice",
            exempt: false,
        });
        expect(byId.get(unset)).toMatchObject({
            title: "Tax invoice",
            exempt: false,
        });
    });

    it("the detail agrees with the list", async () => {
        expect(await service.get(org, exempt)).toMatchObject({
            title: "Bill of supply",
            exempt: true,
        });
        expect(await service.get(org, unset)).toMatchObject({
            title: "Tax invoice",
            exempt: false,
        });
    });

    it("the pay link's paper says bill of supply, and nothing about the rates", async () => {
        const paper = await invoicePaper(org.organizationId, exempt);
        expect(paper.billOfSupply).toBe(true);
        expect(JSON.stringify(paper)).not.toContain(GSTIN);
        expect(
            (await invoicePaper(org.organizationId, mixed)).billOfSupply,
        ).toBe(false);
    });

    it("a credit note against it reads Credit note, with no tax columns", async () => {
        const note = await service.credit(org, exempt, {
            reason: "Treatment not given",
        });
        expect(note).toMatchObject({
            kind: "CREDIT_NOTE",
            title: "Credit note",
            exempt: true,
        });
        const list = await service.list(org, {});
        expect(list.find((i) => i.id === note.id)).toMatchObject({
            title: "Credit note",
            exempt: true,
        });
        // The same number series: its numbers are the business's own.
        expect(note.number).toMatch(/^KD/);
    });
});
