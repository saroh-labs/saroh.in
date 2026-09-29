/**
 * D16 against a real Postgres: "Download PDF" answers an issued invoice's
 * paper as a PDF named for its number, with the business's frozen GSTIN
 * and its CGST and SGST in it; a draft is a 409, another business's
 * invoice a 404, and a role without `invoice:read` a 403. Nothing is
 * stored: rendering it writes no row.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
// The controller is called directly; its guards are the request's.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { execFileSync } from "node:child_process";

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicePdfService } from "./invoice-pdf.service";
import type { InvoiceSendService } from "./invoice-send.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

const GSTIN = "29AAGCR1234M1Z5";

const invoices = new InvoicesService();
const pdfs = new InvoicePdfService(invoices);
const controller = new InvoicesController(
    invoices,
    {} as InvoiceSendService,
    pdfs,
);

let rye: OrganizationContext;
let other: OrganizationContext;
let contactId: string;
let seq = 0;

/** pdf.js needs a real `import()`, which Jest's runtime refuses. */
const EXTRACT = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const result = await parser.getText();
    await parser.destroy();
    process.stdout.write(result.text);
});
`;

function textOf(file: Buffer): string {
    return execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    }).toString();
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `invoice-pdf-${process.pid}` },
    });
    rye = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            gstRegistered: true,
            gstState: "29",
            taxId: GSTIN,
            invoicePrefix: "RYE",
            legalName: "Rye and Company Bakery LLP",
            contactEmail: "hello@rye.example",
            timezone: "Asia/Kolkata",
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    contactId = contact.id;

    const second = await prisma.organization.create({
        data: {
            name: "Pulse Studio",
            slug: `invoice-pdf-other-${process.pid}`,
        },
    });
    other = { organizationId: second.id, userId: "user_2", role: "OWNER" };
});

/** A tax invoice as issuing freezes it: ₹2,832 with ₹216 CGST and SGST. */
async function taxInvoice(
    status: "ISSUED" | "PAID" | "DRAFT" = "ISSUED",
): Promise<string> {
    seq += 1;
    const issued = status !== "DRAFT";
    const inv = await prisma.invoice.create({
        data: {
            organizationId: rye.organizationId,
            contactId,
            number: issued ? `RYE/26-27/${String(seq).padStart(4, "0")}` : null,
            status,
            issuedAt: issued ? new Date("2026-09-05T05:00:00Z") : null,
            dueAt: issued ? new Date("2026-09-19T05:00:00Z") : null,
            billToName: issued ? "Asha Rao" : null,
            billToEmail: issued ? "asha@example.com" : null,
            sellerGstin: issued ? GSTIN : null,
            sellerState: issued ? "29" : null,
            sellerAddress: issued
                ? "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka"
                : null,
            placeOfSupply: issued ? "29" : null,
            taxType: issued ? "INTRA" : null,
            currency: "INR",
            subtotal: "2400.00",
            tax: "432.00",
            cgst: "216.00",
            sgst: "216.00",
            total: "2832.00",
            lines: {
                create: [
                    {
                        organizationId: rye.organizationId,
                        position: 0,
                        description: "Celebration cake",
                        quantity: 2,
                        unitPrice: "1416.00",
                        amount: "2832.00",
                        hsnSac: "19059010",
                        gstRate: "18",
                        taxableValue: "2400.00",
                        cgst: "216.00",
                        sgst: "216.00",
                    },
                ],
            },
        },
    });
    return inv.id;
}

describe("Download PDF (real database)", () => {
    it("answers the issued tax invoice as a PDF named for its number", async () => {
        const id = await taxInvoice();
        const file = await controller.pdf(rye, id);
        const headers = file.getHeaders();
        expect(headers.type).toBe("application/pdf");
        expect(headers.disposition).toBe(
            `attachment; filename="RYE-26-27-${String(seq).padStart(4, "0")}.pdf"`,
        );

        const { file: pdf } = await pdfs.render(rye, id);
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        const text = textOf(pdf);
        for (const words of [
            "TAX INVOICE",
            `RYE/26-27/${String(seq).padStart(4, "0")}`,
            "Rye and Company Bakery LLP",
            "hello@rye.example",
            `GSTIN ${GSTIN} · Karnataka (29)`,
            "Issued 5 Sep 2026 · due 19 Sep 2026",
            "Karnataka (29) — CGST + SGST",
            "CGST",
            "SGST",
            "₹216",
            "₹2,832",
        ]) {
            expect(text).toContain(words);
        }
    });

    it("a paid invoice has its PDF too, and it says so", async () => {
        const id = await taxInvoice("PAID");
        const text = textOf((await pdfs.render(rye, id)).file);
        expect(text).toContain("Paid in full.");
    });

    it("stores nothing", async () => {
        const id = await taxInvoice();
        const before = await prisma.invoice.findUniqueOrThrow({
            where: { id },
        });
        await pdfs.render(rye, id);
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id },
        });
        expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it("a draft has no PDF: 409", async () => {
        const id = await taxInvoice("DRAFT");
        await expect(pdfs.render(rye, id)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("another business's invoice is not found: 404", async () => {
        const id = await taxInvoice();
        await expect(pdfs.render(other, id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("a role without invoice:read is refused: 403", async () => {
        const id = await taxInvoice();
        const noRead: OrganizationContext = {
            ...rye,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: new Set(),
        };
        await expect(pdfs.render(noRead, id)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});
