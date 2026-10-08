/**
 * The pay link's "Download PDF" against a real Postgres (DEC-083): the
 * issued paper the merchant downloads, found by the token's hash as the pay
 * read finds it, drawn on request and never stored. A replaced link, a void
 * invoice and a draft are all a 404, and one business's link never draws
 * another's paper.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import type { MediaService } from "../media/media.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicePdfService } from "./public-invoice-pdf.service";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const invoices = new InvoicesService();
// No business below has a logo, so storage is never read.
const drawer = new IssuedInvoicePdf({} as MediaService);
const pdfs = () => new PublicInvoicePdfService(drawer);

async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `pdf83-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: `user_${name}`,
        role: "OWNER",
    };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_83",
        keyId: "rzp_test_83",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_83",
    });
    return owner;
}

async function draft(owner: OrganizationContext) {
    const contact = await prisma.contact.create({
        data: {
            organizationId: owner.organizationId,
            email: `asha-${tag}-${++seq}@example.com`,
            firstName: "Asha",
        },
    });
    return invoices.createDraft(owner, {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Tasting menu", quantity: 1, unitPrice: "800" }],
    });
}

async function issuedWithLink(owner: OrganizationContext) {
    const d = await draft(owner);
    const issued = await invoices.issue(owner, d.id);
    const { token } = await invoices.createPayLink(owner, d.id);
    return { id: d.id, number: issued.number!, token };
}

describe("the pay link's PDF (DEC-083, real database)", () => {
    it("answers the issued paper for a live link, named for its number", async () => {
        const owner = await business("Rye");
        const { token, number } = await issuedWithLink(owner);
        const before = await prisma.invoice.count();
        const { file, fileName } = await pdfs().pdf(token, "caller_1");
        expect(file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(fileName).toBe(
            `${number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
        );
        // Drawn, never stored.
        expect(await prisma.invoice.count()).toBe(before);
    });

    it("a replaced link is a 404; the new one draws", async () => {
        const owner = await business("Pulse");
        const { id, token } = await issuedWithLink(owner);
        const { token: fresh } = await invoices.createPayLink(owner, id);
        await expect(pdfs().pdf(token, "caller_2")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(pdfs().pdf(fresh, "caller_2")).resolves.toHaveProperty(
            "fileName",
        );
    });

    it("a void invoice is a 404, its link kept or not", async () => {
        const owner = await business("Northwind");
        const kept = await issuedWithLink(owner);
        // Voided with its link still on the row: the paper isn't handed out.
        await prisma.invoice.update({
            where: { id: kept.id },
            data: { status: "VOID" },
        });
        await expect(pdfs().pdf(kept.token, "caller_3")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const voided = await issuedWithLink(owner);
        await invoices.voidInvoice(owner, voided.id, { reason: "Duplicate" });
        await expect(
            pdfs().pdf(voided.token, "caller_3"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a draft has no paper, and an unknown token is a 404", async () => {
        const owner = await business("Kavi");
        const d = await draft(owner);
        await expect(drawer.draw(owner.organizationId, d.id)).resolves.toBe(
            null,
        );
        await expect(
            pdfs().pdf(`no-such-token-${tag}`, "caller_4"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("draws only the token's own business's paper", async () => {
        const rye = await business("Ryeb");
        const kavi = await business("Kavib");
        const ryes = await issuedWithLink(rye);
        // Another business's id never names Rye's invoice.
        await expect(drawer.draw(kavi.organizationId, ryes.id)).resolves.toBe(
            null,
        );
        await expect(drawer.draw(rye.organizationId, ryes.id)).resolves.toEqual(
            expect.objectContaining({ fileName: expect.any(String) }),
        );
    });
});
