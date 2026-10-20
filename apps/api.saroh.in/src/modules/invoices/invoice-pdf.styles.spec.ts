/**
 * Invoice styles in the PDF (DEC-173, #1118): Classic, Band and Compact
 * each draw every particular CGST Rule 46 asks of a tax invoice; an
 * unregistered business's receipt shows no GST in any of them; a long name
 * wraps and stays on the page; the business's colour is drawn readable
 * (a pale band takes ink text, a dark one white); and the logo is there
 * when there is one and the paper still draws without. The text is read
 * back out of the PDF, and the colours out of its uncompressed drawing.
 */
import { execFileSync } from "node:child_process";
import { crc32, deflateSync } from "node:zlib";

import { PAPER_INK, PAPER_WHITE } from "@saroh/block-contract";

import type { PaperBusiness, PaperView } from "./invoice-paper-view";
import { paperLook, paperView } from "./invoice-paper-view";
import { renderInvoicePdf } from "./invoice-pdf";
import type { PaperStyle } from "./paper-styles";
import { PAPER_STYLES, RULE_46_FIELDS } from "./paper-styles";
import type { InvoiceRow } from "./serialize";
import { serializeInvoice } from "./serialize";

const GSTIN = "29AAGCR1234M1Z5";
const BUYER_GSTIN = "29ABCFB2207K1ZL";
const NOW = new Date("2026-09-20T06:00:00Z");
const ZONE = "Asia/Kolkata";

const RYE: PaperBusiness = {
    name: "Rye & Co.",
    legalName: "Rye and Company Bakery LLP",
    email: "hello@rye.example",
};
const PULSE: PaperBusiness = {
    name: "Pulse Studio",
    legalName: null,
    email: null,
};

type Line = NonNullable<InvoiceRow["lines"]>[number];

function line(over: Partial<Line> = {}): Line {
    return {
        id: `line_${Math.random().toString(36).slice(2)}`,
        position: 0,
        description: "Sourdough loaf",
        quantity: 1,
        unitPrice: "2400.00",
        amount: "2400.00",
        discount: "0.00",
        hsnSac: null,
        gstRate: null,
        taxableValue: null,
        cgst: "0.00",
        sgst: "0.00",
        igst: "0.00",
        orderItemId: null,
        ...over,
    };
}

function row(over: Partial<InvoiceRow> = {}): InvoiceRow {
    return {
        id: "inv_1",
        number: "RYE/26-27/0012",
        status: "ISSUED",
        contactId: "c_1",
        contact: {
            id: "c_1",
            firstName: "Asha",
            lastName: "Rao",
            email: "asha@example.com",
        },
        billToName: "Asha Rao",
        billToEmail: "asha@example.com",
        currency: "INR",
        subtotal: "2400.00",
        tax: "0.00",
        total: "2400.00",
        issuedAt: new Date("2026-09-05T05:00:00Z"),
        dueAt: new Date("2026-09-19T05:00:00Z"),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: "user_1",
        createdAt: new Date("2026-09-05T05:00:00Z"),
        updatedAt: new Date("2026-09-05T05:00:00Z"),
        kind: "INVOICE",
        lines: [line()],
        ...over,
    };
}

/** A registered bakery's tax invoice to a registered buyer, in Karnataka. */
function taxInvoice(over: Partial<InvoiceRow> = {}): InvoiceRow {
    return row({
        sellerGstin: GSTIN,
        sellerState: "29",
        sellerAddress: "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        billToGstin: BUYER_GSTIN,
        billToAddress: "7 27th Main, HSR Layout, Bengaluru 560102",
        placeOfSupply: "29",
        taxType: "INTRA",
        subtotal: "2400.00",
        cgst: "216.00",
        sgst: "216.00",
        igst: "0.00",
        tax: "432.00",
        total: "2832.00",
        lines: [
            line({
                description: "Celebration cake",
                quantity: 7,
                unitPrice: "404.57",
                amount: "2832.00",
                hsnSac: "19059010",
                gstRate: "18.00",
                taxableValue: "2400.00",
                cgst: "216.00",
                sgst: "216.00",
            }),
        ],
        ...over,
    });
}

/** An unregistered studio's paid receipt: no GST anywhere. */
function receipt(over: Partial<InvoiceRow> = {}): InvoiceRow {
    return row({
        number: "PS-0007",
        status: "PAID",
        paidAt: new Date("2026-09-06T05:00:00Z"),
        ...over,
    });
}

/** Issued paper in `style` and `colour`, as frozen on the row. */
function view(
    r: InvoiceRow,
    style: PaperStyle,
    colour: string | null = null,
    business: PaperBusiness = RYE,
): PaperView {
    const i = serializeInvoice(
        { ...r, paperStyle: style, paperColour: colour },
        NOW,
        { detail: true },
    );
    return paperView({ ...i, number: i.number! }, business, ZONE);
}

const EXTRACT = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const result = await parser.getText();
    const images = await parser.getImage({ imageThreshold: 0 });
    await parser.destroy();
    process.stdout.write(JSON.stringify({
        text: result.text,
        pages: result.total,
        images: images.pages.reduce((n, p) => n + p.images.length, 0),
    }));
});
`;

async function read(v: PaperView, logo: Buffer | null = null) {
    const file = await renderInvoicePdf(v, { logo });
    const out = execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    });
    const parsed = JSON.parse(out.toString()) as {
        text: string;
        pages: number;
        images: number;
    };
    return {
        ...parsed,
        flat: parsed.text.replace(/\s+/g, " "),
        squashed: squash(parsed.text),
    };
}

/**
 * Text with no spaces, in capitals: a spaced-out heading ("PLACE OF
 * SUPPLY", drawn with letter spacing) reads back as "P L AC E", so
 * headings are matched squashed.
 */
function squash(text: string): string {
    return text.replace(/\s+/g, "").toUpperCase();
}

/** Every colour the PDF fills (`scn`) and strokes (`SCN`) with, as hex. */
async function coloursOf(v: PaperView) {
    const file = await renderInvoicePdf(v, { compress: false });
    const content = file.toString("latin1");
    const hex = (parts: string[]) =>
        `#${parts
            .map((p) =>
                Math.round(Number(p) * 255)
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
            .toUpperCase()}`;
    const fills = new Set<string>();
    const strokes = new Set<string>();
    for (const m of content.matchAll(
        /([\d.]+) ([\d.]+) ([\d.]+) (scn|SCN)\b/g,
    )) {
        (m[4] === "scn" ? fills : strokes).add(hex([m[1]!, m[2]!, m[3]!]));
    }
    return { fills, strokes };
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
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc(12 * (1 + 12 * 4), 0x60);
    for (let r = 0; r < 12; r++) raw[r * (1 + 12 * 4)] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

/**
 * What each Rule 46 particular reads as on Rye's tax invoice. The
 * signature is on the paper that carries one (below): a business's own is
 * #1060.
 */
const RULE_46_WORDS: Record<string, string[]> = {
    sellerName: ["Rye & Co."],
    sellerAddress: ["22 Hill Road, Indiranagar, Bengaluru 560038"],
    sellerGstin: [`GSTIN ${GSTIN}`],
    number: ["RYE/26-27/0012"],
    date: ["Issued 5 Sep 2026"],
    buyerName: ["Asha Rao"],
    buyerAddress: ["7 27th Main, HSR Layout, Bengaluru 560102"],
    buyerGstin: [`GSTIN ${BUYER_GSTIN}`],
    hsn: ["HSN / SAC", "1905 90 10"],
    description: ["Celebration cake"],
    quantity: ["QTY"],
    total: ["Total", "₹2,832"],
    taxableValue: ["Taxable value", "₹2,400"],
    rate: ["GST 18%"],
    taxSplit: ["CGST", "SGST", "₹216"],
    placeOfSupply: ["Place of supply", "Karnataka (29) — CGST + SGST"],
    reverseCharge: ["Reverse charge does not apply."],
};

const SIGNATURE = {
    for: "For Rye and Company Bakery LLP",
    role: "Authorised signatory",
    note: "This is a computer-generated invoice.",
};

describe.each(PAPER_STYLES)("%s", (style) => {
    it("draws every Rule 46 particular of a tax invoice", async () => {
        const { flat, squashed, pages } = await read(
            view(taxInvoice(), style, "#6B3F1D"),
        );
        expect(pages).toBe(1);
        for (const field of RULE_46_FIELDS) {
            if (field.key === "signature") continue;
            const words = RULE_46_WORDS[field.key];
            expect(words).toBeDefined();
            for (const w of words!) expect(squashed).toContain(squash(w));
        }
        expect(flat.toUpperCase()).toContain("TAX INVOICE");
        // The quantity itself, beside its line.
        expect(flat).toMatch(/Celebration cake.*\b7\b/);
    });

    it("an interstate buyer's paper splits it as IGST", async () => {
        const { flat } = await read(
            view(
                taxInvoice({
                    billToGstin: "27AAACB2345N1Z3",
                    placeOfSupply: "27",
                    taxType: "INTER",
                    cgst: "0.00",
                    sgst: "0.00",
                    igst: "432.00",
                    lines: [
                        line({
                            description: "Celebration cake",
                            quantity: 7,
                            amount: "2832.00",
                            hsnSac: "19059010",
                            gstRate: "18.00",
                            taxableValue: "2400.00",
                            igst: "432.00",
                        }),
                    ],
                }),
                style,
                "#1F3A5F",
            ),
        );
        expect(flat).toContain("Maharashtra (27) — IGST");
        expect(flat).toContain("IGST");
        expect(flat).toContain("₹432");
        // CGST only as the Act the footer names.
        expect(flat.replace(/CGST Act/g, "")).not.toContain("CGST");
        expect(flat).not.toContain("SGST");
    });

    it("draws the signature on paper that carries one", async () => {
        const { flat } = await read({
            ...view(taxInvoice(), style, "#6B3F1D"),
            signature: SIGNATURE,
        });
        expect(flat).toContain(SIGNATURE.for);
        expect(flat).toContain(SIGNATURE.role);
        expect(flat).toContain(SIGNATURE.note);
    });

    it("an unregistered business's receipt shows no GST anywhere", async () => {
        const v = view(receipt(), style, "#1F3A5F", PULSE);
        const { flat, squashed } = await read(v);
        expect(flat.toUpperCase()).toContain("RECEIPT");
        expect(flat).toContain("Not registered for GST");
        expect(flat).toContain("₹2,400");
        for (const gst of [
            "GSTIN",
            "CGST",
            "SGST",
            "IGST",
            "HSN",
            "SAC",
            "Place of supply",
            "Taxable value",
            "Tax invoice",
            "Reverse charge",
            "GST 18%",
        ]) {
            expect(squashed).not.toContain(squash(gst));
        }
    });

    it("a long business name wraps whole and stays on the page", async () => {
        const name =
            "The Very Long Named Artisanal Sourdough and Viennoiserie Bakehouse Cooperative of Indiranagar and Koramangala";
        const { flat, pages } = await read(
            view(taxInvoice({ sellerName: name }), style, "#6B3F1D"),
        );
        expect(pages).toBe(1);
        expect(flat).toContain(name);
        expect(flat).toContain("RYE/26-27/0012");
        expect(flat).toContain(`GSTIN ${GSTIN}`);
    });

    it("a long order runs onto numbered pages with every line", async () => {
        const lines = Array.from({ length: 60 }, (_, n) =>
            line({ position: n, description: `Croissant tray ${n + 1}` }),
        );
        const { text, pages } = await read(
            view(
                row({ lines, subtotal: "144000.00", total: "144000.00" }),
                style,
            ),
        );
        expect(pages).toBeGreaterThan(1);
        for (let n = 1; n <= 60; n++) {
            expect(text).toMatch(new RegExp(`Croissant tray ${n}\\b`));
        }
        expect(text).toContain(`RYE/26-27/0012 · page ${pages} of ${pages}`);
    });

    it("draws without a logo, and with one when there is one", async () => {
        const v = view(taxInvoice(), style, "#6B3F1D");
        const without = await read(v);
        expect(without.images).toBe(0);
        expect(without.flat).toContain("Rye & Co.");
        const withLogo = await read(v, logoPng());
        expect(withLogo.images).toBe(1);
        expect(withLogo.flat).toContain("Rye & Co.");
    });
});

describe("the colour", () => {
    it("a paper with no look (Saroh's own) is Classic in ink", () => {
        const v = view(taxInvoice(), "CLASSIC");
        expect(v.look).toEqual(paperLook({ style: "CLASSIC", colour: null }));
    });

    it("Classic in ink draws only ink, grey and its rules: no colour", async () => {
        const { fills, strokes } = await coloursOf(
            view(taxInvoice(), "CLASSIC"),
        );
        for (const c of [...fills, ...strokes]) {
            expect(["#1C1C19", "#66655E", "#D8D5CB"]).toContain(c);
        }
    });

    it("Classic in a dark colour draws its title and heavy rules in it", async () => {
        const { fills, strokes } = await coloursOf(
            view(taxInvoice(), "CLASSIC", "#1F3A5F"),
        );
        expect(fills).toContain("#1F3A5F");
        expect(strokes).toContain("#1F3A5F");
    });

    it("a pale colour is darkened on white until it reads, never drawn pale", async () => {
        for (const style of ["CLASSIC", "COMPACT"] as const) {
            const v = view(taxInvoice(), style, "#F5E6A8");
            const { fills, strokes } = await coloursOf(v);
            expect(fills).not.toContain("#F5E6A8");
            expect(strokes).not.toContain("#F5E6A8");
            expect(strokes).toContain(v.look!.accent);
        }
    });

    it("Band in a pale yellow takes ink text on the yellow", async () => {
        const v = view(taxInvoice(), "BAND", "#F5E6A8");
        expect(v.look?.band).toEqual({
            fill: "#F5E6A8",
            text: PAPER_INK,
            tone: "INK",
        });
        const { fills } = await coloursOf(v);
        expect(fills).toContain("#F5E6A8");
        expect(fills).not.toContain(PAPER_WHITE);
    });

    it("Band in a dark blue takes white text on the blue", async () => {
        const v = view(taxInvoice(), "BAND", "#1F3A5F");
        expect(v.look?.band).toEqual({
            fill: "#1F3A5F",
            text: PAPER_WHITE,
            tone: "WHITE",
        });
        const { fills } = await coloursOf(v);
        expect(fills).toContain("#1F3A5F");
        expect(fills).toContain(PAPER_WHITE);
    });

    it("Band with no colour chosen is an ink band with white text", async () => {
        const { fills } = await coloursOf(view(taxInvoice(), "BAND"));
        expect(fills).toContain("#1C1C19");
        expect(fills).toContain(PAPER_WHITE);
    });
});
