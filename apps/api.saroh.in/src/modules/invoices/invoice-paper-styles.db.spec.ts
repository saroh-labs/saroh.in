/**
 * Invoice styles against a real Postgres (DEC-173, #1118):
 *
 * - The business's default style and colour save through the settings
 *   PATCH, Owner or Admin only (`org:update`); a bad colour or style is a
 *   400 on its field, and "" clears either.
 * - A draft that chose nothing reads in the business's default; one that
 *   chose its own keeps it; "" goes back to the default.
 * - Issuing freezes the look on the invoice. A later change of default
 *   never redraws issued paper, its PDF included.
 * - A credit note and a reissued draft keep the look their invoice went
 *   out in.
 * - A role without `invoice:write` cannot style a draft.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { paperView } from "./invoice-paper-view";
import { InvoicesService } from "./invoices.service";

const invoices = new InvoicesService();
const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);

const GSTIN = "29AAGCR1234M1Z5";
const LINES = [
    {
        description: "Celebration cake",
        quantity: 1,
        unitPrice: "1180",
        hsnSac: "19059010",
        gstRate: "18",
    },
];

let seq = 0;

/** A business, its Owner, and one customer. */
async function business(registered = false): Promise<{
    owner: OrganizationContext;
    contactId: string;
}> {
    seq += 1;
    const org = await prisma.organization.create({
        data: {
            name: "Rye & Co.",
            slug: `paper-styles-${process.pid}-${seq}`,
        },
    });
    if (registered) {
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                gstRegistered: true,
                gstState: "29",
                taxId: GSTIN,
                invoicePrefix: "RYE",
            },
        });
    }
    await giveBusinessDetails(org.id);
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    return {
        owner: { organizationId: org.id, userId: "user_owner", role: "OWNER" },
        contactId: contact.id,
    };
}

const as = (
    ctx: OrganizationContext,
    role: OrganizationContext["role"],
): OrganizationContext => ({ ...ctx, userId: `user_${role}`, role });

async function setDefault(
    ctx: OrganizationContext,
    style: string,
    colour: string,
) {
    return settings.update(ctx, { invoicePaper: { style, colour } });
}

async function stored(id: string) {
    return prisma.invoice.findUniqueOrThrow({
        where: { id },
        select: { paperStyle: true, paperColour: true },
    });
}

function refusalField(err: unknown): string | undefined {
    expect(err).toBeInstanceOf(BadRequestException);
    return (
        (err as BadRequestException).getResponse() as {
            details?: { field?: string };
        }
    ).details?.field;
}

describe("the business's default look (real database)", () => {
    it("is Classic in ink until chosen", async () => {
        const { owner } = await business();
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "CLASSIC",
            colour: null,
        });
    });

    it('the Owner sets it, it reads back, and "" clears it', async () => {
        const { owner } = await business();
        const saved = await setDefault(owner, "BAND", "#6b3f1d");
        expect(saved.invoicePaper).toEqual({
            style: "BAND",
            colour: "#6B3F1D",
        });
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "BAND",
            colour: "#6B3F1D",
        });
        const row = await prisma.businessProfile.findUniqueOrThrow({
            where: { organizationId: owner.organizationId },
            select: { invoiceStyle: true, invoiceColour: true },
        });
        expect(row).toEqual({ invoiceStyle: "BAND", invoiceColour: "#6B3F1D" });

        // One field at a time: the other is left as it is.
        await settings.update(owner, { invoicePaper: { colour: "" } });
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "BAND",
            colour: null,
        });
        await settings.update(owner, { invoicePaper: { style: "" } });
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "CLASSIC",
            colour: null,
        });
    });

    it("an Admin may set it", async () => {
        const { owner } = await business();
        const saved = await setDefault(
            as(owner, "ADMIN"),
            "COMPACT",
            "#1F3A5F",
        );
        expect(saved.invoicePaper).toEqual({
            style: "COMPACT",
            colour: "#1F3A5F",
        });
    });

    it("a Member cannot change it (403), and it stays as it was", async () => {
        const { owner } = await business();
        await setDefault(owner, "BAND", "#6B3F1D");
        await expect(
            setDefault(as(owner, "MEMBER"), "COMPACT", "#1F3A5F"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "BAND",
            colour: "#6B3F1D",
        });
    });

    it("a bad colour or style is a 400 on its field, and nothing is saved", async () => {
        const { owner } = await business();
        const colour = await setDefault(owner, "BAND", "brown").catch(
            (e: unknown) => e,
        );
        expect(refusalField(colour)).toBe("invoiceColour");
        const style = await setDefault(owner, "FANCY", "#6B3F1D").catch(
            (e: unknown) => e,
        );
        expect(refusalField(style)).toBe("invoiceStyle");
        expect((await settings.get(owner)).invoicePaper).toEqual({
            style: "CLASSIC",
            colour: null,
        });
    });
});

describe("a draft's look and the freeze at issue (real database)", () => {
    it("a draft that chose nothing follows today's default", async () => {
        const { owner, contactId } = await business();
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
        });
        expect(draft.paper).toEqual({ style: "CLASSIC", colour: null });
        expect(draft.paperChoice).toEqual({ style: null, colour: null });

        await setDefault(owner, "BAND", "#6B3F1D");
        const read = await invoices.get(owner, draft.id);
        expect(read.paper).toEqual({ style: "BAND", colour: "#6B3F1D" });
        expect(read.paperChoice).toEqual({ style: null, colour: null });
        expect(await stored(draft.id)).toEqual({
            paperStyle: null,
            paperColour: null,
        });
    });

    it("issuing freezes the default as it is then; a later change never redraws it", async () => {
        const { owner, contactId } = await business(true);
        await setDefault(owner, "BAND", "#1F3A5F");
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
        });
        const issued = await invoices.issue(owner, draft.id);
        expect(await stored(draft.id)).toEqual({
            paperStyle: "BAND",
            paperColour: "#1F3A5F",
        });
        expect(issued.paper).toEqual({ style: "BAND", colour: "#1F3A5F" });

        await setDefault(owner, "COMPACT", "#F5E6A8");
        const after = await invoices.get(owner, draft.id);
        expect(after.paper).toEqual({ style: "BAND", colour: "#1F3A5F" });
        // The PDF's paper is drawn from the frozen look.
        const v = paperView(
            { ...after, number: after.number! },
            { name: "Rye & Co.", legalName: null, email: null },
            "Asia/Kolkata",
        );
        expect(v.look?.style).toBe("BAND");
        expect(v.look?.band).toEqual({
            fill: "#1F3A5F",
            text: "#FFFFFF",
            tone: "WHITE",
        });
        // Rule 46: the frozen GSTIN still prints in the band.
        expect(v.seller.tax).toContain(GSTIN);
    });

    it("issuing with no default freezes Classic in ink, written out", async () => {
        const { owner, contactId } = await business();
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: [{ description: "Class", quantity: 1, unitPrice: "500" }],
        });
        await invoices.issue(owner, draft.id);
        expect(await stored(draft.id)).toEqual({
            paperStyle: "CLASSIC",
            paperColour: null,
        });
        await setDefault(owner, "BAND", "#6B3F1D");
        expect((await invoices.get(owner, draft.id)).paper).toEqual({
            style: "CLASSIC",
            colour: null,
        });
    });

    it("a draft's own choice wins over the default and is what issues", async () => {
        const { owner, contactId } = await business(true);
        await setDefault(owner, "BAND", "#6B3F1D");
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
            paperStyle: "COMPACT",
        });
        // Style its own, colour still the business's.
        expect(draft.paper).toEqual({ style: "COMPACT", colour: "#6B3F1D" });

        const updated = await invoices.updateDraft(owner, draft.id, {
            paperColour: "#1f3a5f",
        });
        expect(updated.paper).toEqual({ style: "COMPACT", colour: "#1F3A5F" });
        expect(updated.paperChoice).toEqual({
            style: "COMPACT",
            colour: "#1F3A5F",
        });

        // An edit that sends no look keeps the one chosen.
        await invoices.updateDraft(owner, draft.id, {
            lines: [{ ...LINES[0]!, quantity: 2 }],
        });
        await invoices.issue(owner, draft.id);
        expect(await stored(draft.id)).toEqual({
            paperStyle: "COMPACT",
            paperColour: "#1F3A5F",
        });
    });

    it('"" on a draft goes back to the default', async () => {
        const { owner, contactId } = await business();
        await setDefault(owner, "BAND", "#6B3F1D");
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
            paperStyle: "COMPACT",
            paperColour: "#1F3A5F",
        });
        const back = await invoices.updateDraft(owner, draft.id, {
            paperStyle: "",
            paperColour: null,
        });
        expect(back.paperChoice).toEqual({ style: null, colour: null });
        expect(back.paper).toEqual({ style: "BAND", colour: "#6B3F1D" });
    });

    it("a bad style or colour on a draft is a 400 on its field", async () => {
        const { owner, contactId } = await business();
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
        });
        const colour = await invoices
            .updateDraft(owner, draft.id, { paperColour: "#12" })
            .catch((e: unknown) => e);
        expect(refusalField(colour)).toBe("paperColour");
        const style = await invoices
            .createDraft(owner, {
                contactId,
                currency: "INR",
                lines: LINES,
                paperStyle: "POSTER",
            })
            .catch((e: unknown) => e);
        expect(refusalField(style)).toBe("paperStyle");
    });

    it("a Member cannot style a draft (403)", async () => {
        const { owner, contactId } = await business();
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
        });
        await expect(
            invoices.updateDraft(as(owner, "MEMBER"), draft.id, {
                paperStyle: "BAND",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await stored(draft.id)).toEqual({
            paperStyle: null,
            paperColour: null,
        });
    });

    it("a credit note is drawn in its invoice's frozen look", async () => {
        const { owner, contactId } = await business(true);
        await setDefault(owner, "BAND", "#6B3F1D");
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: LINES,
        });
        await invoices.issue(owner, draft.id);
        await setDefault(owner, "COMPACT", "#1F3A5F");
        const note = await invoices.credit(owner, draft.id, {
            reason: "Wrong cake",
        });
        expect(note.kind).toBe("CREDIT_NOTE");
        expect(await stored(note.id)).toEqual({
            paperStyle: "BAND",
            paperColour: "#6B3F1D",
        });
    });

    it("a reissued receipt's draft keeps the look it went out in", async () => {
        const { owner, contactId } = await business();
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: [{ description: "Class", quantity: 1, unitPrice: "500" }],
            paperStyle: "COMPACT",
            paperColour: "#1F3A5F",
        });
        await invoices.issue(owner, draft.id);
        const again = await invoices.reissue(owner, draft.id, {
            reason: "Wrong name",
        });
        expect(again.status).toBe("DRAFT");
        expect(again.paperChoice).toEqual({
            style: "COMPACT",
            colour: "#1F3A5F",
        });
    });
});
