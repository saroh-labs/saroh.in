/**
 * #1161 against a real Postgres: an invoice issued while the business was
 * not registered for GST keeps saying so after a GSTIN is added. Its paper
 * prints no GSTIN in the seller block and keeps its "not registered" line
 * at the foot, on the detail, the PDF and the pay link's paper; an invoice
 * issued after registering prints the GSTIN. The seller block reads what
 * was frozen at issue (DEC-082), never the business as it is now.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { execFileSync } from "node:child_process";

import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { invoicePaper } from "../payments/public-invoices.service";
import { paperView } from "./invoice-paper-view";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesService } from "./invoices.service";

const GSTIN = "29AAGCR1234M1Z5";
const RYE = { name: "Rye & Co.", legalName: null, email: null };

const invoices = new InvoicesService();
const pdfs = new InvoicePdfService(
    invoices,
    new MediaService(
        createMemoryStorage({ publicBaseUrl: "https://media.saroh.test" }),
    ),
);

let owner: OrganizationContext;
let contactId: string;

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

/** A one-line invoice, drafted and issued as the merchant does. */
async function issueOne(): Promise<string> {
    const draft = await invoices.createDraft(owner, {
        contactId,
        currency: "INR",
        lines: [
            {
                description: "Celebration cake",
                quantity: 1,
                unitPrice: "1200",
                gstRate: "18",
                hsnSac: "19059010",
            },
        ],
    });
    await invoices.issue(owner, draft.id);
    return draft.id;
}

async function paperOf(id: string) {
    const i = await invoices.get(owner, id);
    return paperView({ ...i, number: i.number! }, RYE, "Asia/Kolkata");
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Rye & Co.",
            slug: `paper-before-gst-${process.pid}-${Date.now()}`,
        },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            gstRegistered: false,
            invoicePrefix: "RYE",
            timezone: "Asia/Kolkata",
        },
    });
    await giveBusinessDetails(org.id);
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
});

describe("a paper issued before GST registration (real database)", () => {
    let before: string;
    let after: string;

    beforeAll(async () => {
        before = await issueOne();
        // The business registers for GST after issuing it.
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: { gstRegistered: true, taxId: GSTIN, gstState: "29" },
        });
        after = await issueOne();
    });

    it("froze no GST on the earlier invoice, and the GSTIN on the later one", async () => {
        const rows = await prisma.invoice.findMany({
            where: { id: { in: [before, after] } },
            select: { id: true, sellerGstin: true, tax: true },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        expect(byId.get(before)!.sellerGstin).toBeNull();
        expect(Number(byId.get(before)!.tax)).toBe(0);
        expect(byId.get(after)!.sellerGstin).toBe(GSTIN);
    });

    it("the earlier paper has no GSTIN and keeps its not-registered line", async () => {
        const view = await paperOf(before);
        expect(view.seller.tax).toBe("Not registered for GST");
        expect(view.seller.lines.join(" ")).not.toContain(GSTIN);
        expect(view.hsnColumn).toBe(false);
        expect(view.footer).toBe(
            "Rye & Co. is not registered for GST, so no tax is charged.",
        );
        const detail = await invoices.get(owner, before);
        expect(detail.gst).toBeNull();
    });

    it("its PDF says the same", async () => {
        const text = textOf((await pdfs.render(owner, before)).file);
        expect(text).not.toContain("GSTIN");
        expect(text).toContain("Not registered for GST");
        expect(text).toContain("so no tax is charged.");
    });

    it("its pay link's paper is not a bill of supply and carries no GSTIN", async () => {
        const paper = await invoicePaper(owner.organizationId, before);
        expect(paper.businessName).toBe("Rye & Co.");
        expect(paper.billOfSupply).toBe(false);
        expect(JSON.stringify(paper)).not.toContain(GSTIN);
    });

    it("an invoice issued after registering prints the GSTIN", async () => {
        const view = await paperOf(after);
        expect(view.seller.tax).toBe(`GSTIN ${GSTIN} · Karnataka (29)`);
        expect(view.footer).toContain("Tax invoice under section 31");
        const text = textOf((await pdfs.render(owner, after)).file);
        expect(text).toContain(`GSTIN ${GSTIN}`);
    });
});
