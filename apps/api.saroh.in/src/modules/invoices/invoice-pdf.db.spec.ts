/**
 * D16 against a real Postgres: "Download PDF" answers an issued invoice's
 * paper as a PDF named for its number, with the business's frozen GSTIN
 * and its CGST and SGST in it; a draft is a 409, another business's
 * invoice a 404, and a role without `invoice:read` a 403. Nothing is
 * stored: rendering it writes no row. A business with a logo has it printed
 * at the top, read from storage; one whose logo's bytes are gone still gets
 * its PDF, without it.
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
import { crc32, deflateSync } from "node:zlib";

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { invoicePaper } from "../payments/public-invoices.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import type { InvoiceSendService } from "./invoice-send.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

const GSTIN = "29AAGCR1234M1Z5";

const storage = createMemoryStorage({
    publicBaseUrl: "https://media.saroh.test",
});
const media = new MediaService(storage);
const invoices = new InvoicesService();
const pdfs = new InvoicePdfService(invoices, media);
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

/** The images a PDF embeds, as [width, height]. */
const IMAGES = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const result = await parser.getImage({ imageThreshold: 0 });
    await parser.destroy();
    process.stdout.write(JSON.stringify(
        result.pages.flatMap((p) => p.images.map((i) => [i.width, i.height])),
    ));
});
`;

function imagesOf(file: Buffer): [number, number][] {
    return JSON.parse(
        execFileSync(process.execPath, ["-e", IMAGES], {
            input: file,
        }).toString(),
    ) as [number, number][];
}

function pngChunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/** A 12-pixel-square RGBA PNG. */
function logoPng(): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(12, 0);
    ihdr.writeUInt32BE(12, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const raw = Buffer.alloc(12 * (1 + 12 * 4), 0x60);
    for (let row = 0; row < 12; row++) raw[row * (1 + 12 * 4)] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

/**
 * Upload `bytes` to the business's library and set it as the logo, as
 * Settings does; `stored: false` leaves storage without the bytes.
 */
async function setLogo(
    ctx: OrganizationContext,
    bytes: Buffer,
    stored = true,
): Promise<void> {
    const ticket = await media.createUpload(ctx, {
        contentType: "image/png",
        contentLength: bytes.length,
        filename: "logo.png",
        purpose: "business-logo",
    });
    if (stored) storage.putBytes(ticket.key, bytes);
    const done = await media.completeUpload(ctx, ticket.mediaId);
    await prisma.businessProfile.update({
        where: { organizationId: ctx.organizationId },
        data: { logoMediaId: done.id, logoUrl: done.url },
    });
}

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

describe("the business logo on the PDF (real database)", () => {
    it("prints the logo set in Settings, above the name, header intact", async () => {
        expect(
            imagesOf((await pdfs.render(rye, await taxInvoice())).file),
        ).toEqual([]);

        await setLogo(rye, logoPng());
        const { file } = await pdfs.render(rye, await taxInvoice());
        expect(imagesOf(file)).toEqual([[12, 12]]);
        const text = textOf(file);
        for (const words of [
            "Rye & Co.",
            "Rye and Company Bakery LLP",
            "TAX INVOICE",
            `GSTIN ${GSTIN} · Karnataka (29)`,
            "₹2,832",
        ]) {
            expect(text).toContain(words);
        }
    });

    it("a logo whose bytes are gone from storage: the PDF, without it", async () => {
        await setLogo(rye, logoPng(), false);
        const { file } = await pdfs.render(rye, await taxInvoice());
        expect(imagesOf(file)).toEqual([]);
        expect(textOf(file)).toContain("Rye & Co.");
    });
});

describe("DEC-072: a plan renewal's PDF shows no GST it does not charge (real database)", () => {
    it("Rye's renewal, issued as the renewal job issues it: no rate, no Nil-rated", async () => {
        const { id } = await prisma.$transaction((tx) =>
            invoices.issueInTx(tx, rye.organizationId, {
                contactId,
                currency: "INR",
                lines: [
                    {
                        description: "Bread club · Sep 2026",
                        quantity: 1,
                        unitPrice: "1200.00",
                    },
                ],
                source: "SUBSCRIPTION",
                createdByUserId: null,
                issuedAt: new Date("2026-09-05T05:00:00Z"),
            }),
        );
        // Stored as it is: a registered paper, its line's rate never set.
        const line = await prisma.invoiceLine.findFirstOrThrow({
            where: { invoiceId: id },
            select: { gstRate: true, cgst: true, sgst: true },
        });
        expect(line.gstRate).toBeNull();
        expect(Number(line.cgst)).toBe(0);
        expect(Number(line.sgst)).toBe(0);

        const text = textOf((await pdfs.render(rye, id)).file);
        expect(text).toContain("Bread club · Sep 2026");
        expect(text).toContain("TAX INVOICE");
        expect(text).toContain(`GSTIN ${GSTIN}`);
        expect(text).not.toContain("Nil-rated");
        expect(text).not.toMatch(/GST \d/);
        expect(text).not.toContain("0%");
    });
});

describe("a renamed business's issued paper (DEC-082, real database)", () => {
    it("issuing freezes the seller; renaming after never changes the view, the PDF or the customer's paper", async () => {
        const org = await prisma.organization.create({
            data: {
                name: "Kavi Dental",
                slug: `invoice-pdf-kavi-${process.pid}`,
            },
        });
        const kavi: OrganizationContext = {
            organizationId: org.id,
            userId: "user_3",
            role: "OWNER",
        };
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                legalName: "Kavi Dental Care LLP",
                contactEmail: "desk@kavi.example",
                gstState: "29",
                addressLine1: "4 Lake Road",
                city: "Bengaluru",
                postalCode: "560001",
                timezone: "Asia/Kolkata",
            },
        });
        const asha = await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "Asha",
            },
        });
        const draft = await invoices.createDraft(kavi, {
            contactId: asha.id,
            currency: "INR",
            lines: [
                { description: "Cleaning", quantity: 1, unitPrice: "1800" },
            ],
        } as never);
        // A draft prints today's settings: none of its own.
        expect(draft.sellerName).toBeNull();
        const issued = await invoices.issue(kavi, draft.id);
        expect(issued).toEqual(
            expect.objectContaining({
                sellerName: "Kavi Dental",
                sellerLegalName: "Kavi Dental Care LLP",
                sellerEmail: "desk@kavi.example",
            }),
        );

        // The business renames itself, its legal name and its email.
        await prisma.organization.update({
            where: { id: org.id },
            data: { name: "Kavi Smile Studio" },
        });
        await prisma.businessProfile.update({
            where: { organizationId: org.id },
            data: {
                legalName: "Kavi Smile Studio Private Limited",
                contactEmail: "hello@kavismile.example",
            },
        });

        // The workspace's view model.
        expect(await invoices.get(kavi, draft.id)).toEqual(
            expect.objectContaining({
                sellerName: "Kavi Dental",
                sellerLegalName: "Kavi Dental Care LLP",
                sellerEmail: "desk@kavi.example",
            }),
        );
        // The PDF.
        const text = textOf((await pdfs.render(kavi, draft.id)).file);
        expect(text).toContain("Kavi Dental");
        expect(text).toContain("Kavi Dental Care LLP");
        expect(text).toContain("desk@kavi.example");
        expect(text).not.toContain("Kavi Smile Studio");
        expect(text).not.toContain("hello@kavismile.example");
        // The pay page and the customer's receipt.
        const paper = await invoicePaper(org.id, draft.id);
        expect(paper.businessName).toBe("Kavi Dental");

        // A new draft follows the new name until it is issued.
        const next = await invoices.createDraft(kavi, {
            contactId: asha.id,
            currency: "INR",
            lines: [
                { description: "Whitening", quantity: 1, unitPrice: "4000" },
            ],
        } as never);
        expect(next.sellerName).toBeNull();
        expect((await invoices.issue(kavi, next.id)).sellerName).toBe(
            "Kavi Smile Studio",
        );
    });
});
