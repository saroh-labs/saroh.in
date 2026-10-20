/**
 * Cancel or correct (DEC-173, U13 #1125) against a real Postgres:
 *
 *  - the credit note "Cancel all of it" previews is the one it issues;
 *  - "Cancel and write a correct one" makes the credit note and a draft
 *    with the same lines in one transaction, and a refusal leaves neither;
 *  - "Write again" on a void invoice makes its draft once, and only there;
 *  - a role without `invoice:write` and another business are refused.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoicesService } from "./invoices.service";

const payments = new InvoicePaymentsService();
const invoices = new InvoicesService(payments);
const GSTIN = "29AAGCR4375J1ZU";

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

let rye: OrganizationContext; // GST-registered: credits
let pulse: OrganizationContext; // not registered: voids
let ryeContact: string;
let pulseContact: string;

async function business(
    name: string,
    registered: boolean,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("cancel") },
    });
    if (registered) {
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                gstRegistered: true,
                gstState: "29",
                taxId: GSTIN,
                invoicePrefix: "RC",
            },
        });
    }
    await giveBusinessDetails(org.id);
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

async function contact(ctx: OrganizationContext): Promise<string> {
    const row = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            email: `${uniq("vivek.nair")}@example.com`,
            firstName: "Vivek",
            lastName: "Nair",
        },
    });
    return row.id;
}

const LINES = [
    {
        description: "Sourdough loaves, trade",
        quantity: 12,
        unitPrice: "500",
        gstRate: "5",
        hsnSac: "1905",
    },
    {
        description: "Croissant trays",
        quantity: 2,
        unitPrice: "1200",
        gstRate: "18",
        hsnSac: "1905",
    },
];

/** An issued invoice, written and issued as the app does it. */
async function issued(ctx: OrganizationContext, contactId: string) {
    const draft = await invoices.createDraft(ctx, {
        contactId,
        currency: "INR",
        lines: LINES,
    });
    return invoices.issue(ctx, draft.id);
}

const linesOf = (invoiceId: string) =>
    prisma.invoiceLine.findMany({
        where: { invoiceId },
        orderBy: { position: "asc" },
        select: {
            description: true,
            quantity: true,
            unitPrice: true,
            gstRate: true,
            hsnSac: true,
        },
    });

const notesOf = (invoiceId: string) =>
    prisma.invoice.findMany({
        where: { relatedInvoiceId: invoiceId, kind: "CREDIT_NOTE" },
        select: { id: true, number: true, total: true, paymentNote: true },
    });

const draftsFrom = (invoiceId: string) =>
    prisma.invoice.findMany({
        where: { reissuedFromId: invoiceId },
        select: { id: true, status: true },
    });

beforeAll(async () => {
    rye = await business("Rye & Co.", true);
    pulse = await business("Pulse Fitness", false);
    ryeContact = await contact(rye);
    pulseContact = await contact(pulse);
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("the credit note shown before it is made", () => {
    it("names the number and amount the credit note then takes", async () => {
        const inv = await issued(rye, ryeContact);
        const preview = await invoices.creditPreview(rye, inv.id);
        expect(preview.currency).toBe("INR");
        expect(preview.amount).toBe(inv.total);
        expect(preview.number).toMatch(/^RCCN\//);

        const note = await invoices.credit(rye, inv.id, {
            reason: "Wrong amount",
        });
        expect(note.number).toBe(preview.number);
        expect(note.total).toBe(inv.total);

        // Nothing is left to credit: the preview says so as the credit would.
        await expect(
            invoices.creditPreview(rye, inv.id),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("takes no number: two previews in a row agree", async () => {
        const inv = await issued(rye, ryeContact);
        const first = await invoices.creditPreview(rye, inv.id);
        const second = await invoices.creditPreview(rye, inv.id);
        expect(second.number).toBe(first.number);
    });

    it("a partly paid invoice is refused before anyone types a reason", async () => {
        const inv = await issued(rye, ryeContact);
        await payments.record(rye, inv.id, { method: "CASH", amount: "100" });
        await expect(invoices.creditPreview(rye, inv.id)).rejects.toThrow(
            /Remove its payments/,
        );
    });
});

describe("Cancel and write a correct one", () => {
    it("credits it in full and opens a draft with the same lines", async () => {
        const inv = await issued(rye, ryeContact);
        const made = await invoices.creditAndRewrite(rye, inv.id, {
            reason: "Wrong person",
        });

        const original = await prisma.invoice.findUniqueOrThrow({
            where: { id: inv.id },
            select: { status: true, payTokenHash: true },
        });
        expect(original.status).toBe("CREDITED");
        expect(original.payTokenHash).toBeNull();

        const notes = await notesOf(inv.id);
        expect(notes).toHaveLength(1);
        expect(notes[0]?.id).toBe(made.creditNote.id);
        expect(notes[0]?.number).toBe(made.creditNote.number);
        expect(notes[0]?.paymentNote).toBe("Wrong person");

        expect(made.draft.status).toBe("DRAFT");
        expect(made.draft.number).toBeNull();
        expect(made.draft.reissuedFromId).toBe(inv.id);
        expect(await linesOf(made.draft.id)).toEqual(await linesOf(inv.id));

        // The invoice it replaces points at the draft, as a reissue's does.
        const view = await invoices.get(rye, inv.id);
        expect(view.reissuedAsId).toBe(made.draft.id);
    });

    it("a partly paid invoice: 409, and neither a credit note nor a draft", async () => {
        const inv = await issued(rye, ryeContact);
        await payments.record(rye, inv.id, { method: "UPI", amount: "1000" });
        await expect(
            invoices.creditAndRewrite(rye, inv.id, { reason: "Wrong amount" }),
        ).rejects.toThrow(/Remove its payments/);
        expect(await notesOf(inv.id)).toEqual([]);
        expect(await draftsFrom(inv.id)).toEqual([]);
    });

    it("a paid invoice is refunded, not written again: 409", async () => {
        const inv = await issued(rye, ryeContact);
        await payments.record(rye, inv.id, { method: "CASH" });
        await expect(
            invoices.creditAndRewrite(rye, inv.id, { reason: "Returned" }),
        ).rejects.toThrow(/refunded with a credit note/);
        expect(await notesOf(inv.id)).toEqual([]);
        expect(await draftsFrom(inv.id)).toEqual([]);
    });

    it("an invoice already credited: 409, and no second draft", async () => {
        const inv = await issued(rye, ryeContact);
        await invoices.creditAndRewrite(rye, inv.id, { reason: "Wrong" });
        await expect(
            invoices.creditAndRewrite(rye, inv.id, { reason: "Wrong" }),
        ).rejects.toThrow(/already credited/);
        expect(await draftsFrom(inv.id)).toHaveLength(1);
        expect(await notesOf(inv.id)).toHaveLength(1);
    });
});

describe("Write again on a void invoice", () => {
    it("opens a draft with the same lines, once", async () => {
        const inv = await issued(pulse, pulseContact);
        await invoices.voidInvoice(pulse, inv.id, { reason: "Wrong amount" });

        const draft = await invoices.writeAgain(pulse, inv.id);
        expect(draft.status).toBe("DRAFT");
        expect(draft.reissuedFromId).toBe(inv.id);
        expect(await linesOf(draft.id)).toEqual(await linesOf(inv.id));

        await expect(invoices.writeAgain(pulse, inv.id)).rejects.toThrow(
            /already written again/,
        );
        expect(await draftsFrom(inv.id)).toHaveLength(1);
    });

    it("two taps at once make one draft", async () => {
        const inv = await issued(pulse, pulseContact);
        await invoices.voidInvoice(pulse, inv.id, { reason: "Typo" });
        const results = await Promise.allSettled([
            invoices.writeAgain(pulse, inv.id),
            invoices.writeAgain(pulse, inv.id),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await draftsFrom(inv.id)).toHaveLength(1);
    });

    it("a void invoice written again by Void and write again: 409", async () => {
        const inv = await issued(pulse, pulseContact);
        await invoices.reissue(pulse, inv.id, { reason: "Wrong person" });
        await expect(invoices.writeAgain(pulse, inv.id)).rejects.toThrow(
            /already written again/,
        );
    });

    it("an invoice that isn't void: 409", async () => {
        const inv = await issued(pulse, pulseContact);
        await expect(invoices.writeAgain(pulse, inv.id)).rejects.toThrow(
            /Only a void invoice/,
        );
        expect(await draftsFrom(inv.id)).toEqual([]);
    });
});

describe("who may", () => {
    const member = (ctx: OrganizationContext): OrganizationContext => ({
        ...ctx,
        role: "MEMBER",
    });

    it("a role without invoice:write is refused all three (403)", async () => {
        const inv = await issued(rye, ryeContact);
        const voided = await issued(pulse, pulseContact);
        await invoices.voidInvoice(pulse, voided.id, { reason: "Typo" });
        const attempts = [
            invoices.creditPreview(member(rye), inv.id),
            invoices.creditAndRewrite(member(rye), inv.id, { reason: "x" }),
            invoices.writeAgain(member(pulse), voided.id),
        ];
        for (const attempt of attempts) {
            await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(await notesOf(inv.id)).toEqual([]);
        expect(await draftsFrom(voided.id)).toEqual([]);
    });

    it("another business's invoice is not found (404)", async () => {
        const theirs = await issued(rye, ryeContact);
        const theirVoid = await issued(pulse, pulseContact);
        await invoices.voidInvoice(pulse, theirVoid.id, { reason: "Typo" });
        await expect(
            invoices.creditPreview(pulse, theirs.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            invoices.creditAndRewrite(pulse, theirs.id, { reason: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            invoices.writeAgain(rye, theirVoid.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await notesOf(theirs.id)).toEqual([]);
        expect(await draftsFrom(theirVoid.id)).toEqual([]);
    });
});
