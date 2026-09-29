/**
 * D16: the invoice PDF prints the business logo above its name, as the
 * paper does — a PNG or a JPEG, read from storage. A WebP or SVG, a logo
 * too big, one whose read fails, is slow or whose data is broken is left
 * off with one named warning, and the PDF still goes out with its header
 * intact. The text and images are read back out of the PDF.
 */
import { execFileSync } from "node:child_process";
import { crc32, deflateSync } from "node:zlib";

import { Logger } from "@nestjs/common";
import PDFDocument from "pdfkit";

import type { PaperView } from "./invoice-paper-view";
import { renderInvoicePdf } from "./invoice-pdf";
import {
    LOGO_MAX_BYTES,
    loadInvoiceLogo,
    logoImageType,
    pngDecodes,
} from "./invoice-pdf-logo";

const ORG = "org_rye";

/** A 6×4 JPEG, as an image encoder writes one. */
const JPEG = Buffer.from(
    "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgBh5//2Q==",
    "base64",
);
/** A 4×4 WebP: Settings takes it, pdfkit cannot print it. */
const WEBP = Buffer.from(
    "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoEAAQAAUAmJaQAA3AA/v0gUAA=",
    "base64",
);
const SVG = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
);

function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/**
 * A `size`-square RGBA PNG. With transparency pdfkit decodes it on a zlib
 * callback, the path a broken image would crash. `idat` overrides the
 * compressed pixels.
 */
function png(size = 8, idat?: Buffer): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const raw = Buffer.alloc(size * (1 + size * 4), 0x80);
    for (let row = 0; row < size; row++) raw[row * (1 + size * 4)] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", idat ?? deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

const VIEW: PaperView = {
    title: "Tax invoice",
    number: "RYE/26-27/0012",
    dates: "Issued 5 Sep 2026 · due 19 Sep 2026",
    related: null,
    seller: {
        name: "Rye & Co.",
        lines: ["Rye and Company Bakery LLP", "hello@rye.example"],
        tax: "GSTIN 29AAGCR1234M1Z5 · Karnataka (29)",
    },
    billedTo: { name: "Asha Rao", detail: "asha@example.com", gstin: null },
    placeOfSupply: "Karnataka (29) — CGST + SGST",
    hsnColumn: true,
    lines: [
        {
            description: "Celebration cake",
            sub: null,
            hsn: "1905 90 10",
            quantity: "2",
            amount: "₹2,832",
        },
    ],
    sums: [["Taxable value", "₹2,400"]],
    totalLabel: "Total",
    total: "₹2,832",
    inclusive: "Prices include GST.",
    footer: "Tax invoice under section 31, CGST Act.",
};

/** pdf.js starts its worker with `import()`, which Jest refuses. */
const EXTRACT = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const { text } = await parser.getText();
    const images = await parser.getImage({ imageThreshold: 0 });
    await parser.destroy();
    const sizes = images.pages.flatMap((p) => p.images.map((i) => [i.width, i.height]));
    process.stdout.write(JSON.stringify({ text, sizes }));
});
`;

function read(file: Buffer): { text: string; sizes: [number, number][] } {
    const out = execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    });
    return JSON.parse(out.toString()) as {
        text: string;
        sizes: [number, number][];
    };
}

/** The header reads as before: name, its lines, what it is, its number. */
function expectHeader(text: string) {
    const order = [
        "Rye & Co.",
        "Rye and Company Bakery LLP",
        "hello@rye.example",
        "TAX INVOICE",
        "RYE/26-27/0012",
        "Asha Rao",
    ].map((words) => {
        expect(text).toContain(words);
        return text.indexOf(words);
    });
    expect(order.slice(0, 3)).toEqual(
        [...order.slice(0, 3)].sort((a, b) => a - b),
    );
    expect(text).toContain("₹2,832");
}

let warn: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("what a logo is, by its bytes", () => {
    it("knows a PNG and a JPEG, and nothing else", () => {
        expect(logoImageType(png())).toBe("png");
        expect(logoImageType(JPEG)).toBe("jpeg");
        expect(logoImageType(WEBP)).toBeNull();
        expect(logoImageType(SVG)).toBeNull();
        expect(logoImageType(new Uint8Array())).toBeNull();
    });

    it("a PNG decodes only when its pixels do", () => {
        const parsed = (bytes: Buffer) =>
            (
                new PDFDocument() as PDFKit.PDFDocument & {
                    openImage(b: Buffer): {
                        image: Parameters<typeof pngDecodes>[0];
                    };
                }
            ).openImage(bytes).image;
        expect(pngDecodes(parsed(png()))).toBe(true);
        expect(pngDecodes(parsed(png(8, Buffer.from("not zlib"))))).toBe(false);
        const badFilter = Buffer.alloc(8 * 33, 0x80); // filter byte 0x80
        expect(pngDecodes(parsed(png(8, deflateSync(badFilter))))).toBe(false);
        expect(
            pngDecodes({ ...parsed(png()), width: 9000, height: 9000 }),
        ).toBe(false);
    });
});

describe("reading the logo", () => {
    const profile = {
        logoUrl: "https://media.saroh.test/logo",
        logoMediaId: "m_1",
    };
    const media = (read: () => Promise<unknown>) => ({
        readReadyObjectStart: jest.fn(read) as never,
    });
    const logger = { warn: jest.fn() };
    beforeEach(() => logger.warn.mockReset());

    it("a business with no logo reads nothing and says nothing", async () => {
        const m = media(() => Promise.resolve(null));
        await expect(
            loadInvoiceLogo(
                m,
                ORG,
                { logoUrl: null, logoMediaId: null },
                logger,
            ),
        ).resolves.toBeNull();
        await expect(loadInvoiceLogo(m, ORG, null, logger)).resolves.toBeNull();
        expect(m.readReadyObjectStart).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("reads a PNG or a JPEG from storage, capped, by its library object", async () => {
        for (const bytes of [png(), JPEG]) {
            const m = media(() =>
                Promise.resolve({ bytes, contentType: "image/png" }),
            );
            const logo = await loadInvoiceLogo(m, ORG, profile, logger);
            expect(logo?.equals(bytes)).toBe(true);
            expect(m.readReadyObjectStart).toHaveBeenCalledWith(
                ORG,
                "m_1",
                LOGO_MAX_BYTES + 1,
            );
        }
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each([
        ["a WebP", WEBP, "unsupported_format"],
        ["an SVG", SVG, "unsupported_format"],
        ["one over 2 MB", Buffer.alloc(LOGO_MAX_BYTES + 1, 0xff), "too_large"],
        ["an empty object", Buffer.alloc(0), "not_found"],
    ])("leaves off %s, with a named warning", async (_, bytes, reason) => {
        const m = media(() =>
            Promise.resolve({ bytes, contentType: "image/webp" }),
        );
        await expect(
            loadInvoiceLogo(m, ORG, profile, logger),
        ).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0][0]).toMatch(
            new RegExp(`^invoice_pdf_logo_skipped: .*${ORG}.*reason ${reason}`),
        );
    });

    it("leaves it off when storage has nothing, or fails", async () => {
        await expect(
            loadInvoiceLogo(
                media(() => Promise.resolve(null)),
                ORG,
                profile,
                logger,
            ),
        ).resolves.toBeNull();
        await expect(
            loadInvoiceLogo(
                media(() => Promise.reject(new Error("socket hang up"))),
                ORG,
                profile,
                logger,
            ),
        ).resolves.toBeNull();
        expect(logger.warn.mock.calls.map(([m]) => String(m))).toEqual([
            expect.stringContaining("reason not_found"),
            expect.stringContaining("reason read_failed"),
        ]);
    });

    it("a logo set without a library object is not fetched from its address", async () => {
        const m = media(() => Promise.resolve(null));
        await expect(
            loadInvoiceLogo(m, ORG, { ...profile, logoMediaId: null }, logger),
        ).resolves.toBeNull();
        expect(m.readReadyObjectStart).not.toHaveBeenCalled();
        expect(logger.warn.mock.calls[0][0]).toContain(
            "reason no_library_object",
        );
    });

    it("gives up on a slow read rather than hold the PDF", async () => {
        const m = media(() => new Promise(() => {}));
        const started = Date.now();
        await expect(
            loadInvoiceLogo(m, ORG, profile, logger, 30),
        ).resolves.toBeNull();
        expect(Date.now() - started).toBeLessThan(1000);
        expect(logger.warn.mock.calls[0][0]).toContain("reason timed_out");
    });
});

describe("the logo on the PDF", () => {
    it.each([
        ["PNG", png(), [8, 8]],
        ["JPEG", JPEG, [6, 4]],
    ])(
        "a %s prints once, and the header still reads",
        async (_, logo, size) => {
            const { text, sizes } = read(
                await renderInvoicePdf(VIEW, { logo, organizationId: ORG }),
            );
            expectHeader(text);
            expect(sizes).toEqual([size]);
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it("sits where the paper's does: a 34pt square above the name", async () => {
        const image = jest.spyOn(PDFDocument.prototype, "image");
        const text = jest.spyOn(PDFDocument.prototype, "text");
        await renderInvoicePdf(VIEW, { logo: png(), organizationId: ORG });
        expect(image).toHaveBeenCalledTimes(1);
        expect(image.mock.calls[0].slice(1)).toEqual([
            48,
            48,
            { cover: [34, 34], align: "center", valign: "center" },
        ]);
        const at = (words: string) =>
            text.mock.calls.find(([t]) => t === words)?.slice(1, 3);
        // Name under the logo, 7pt clear; the title stays at the top right.
        expect(at("Rye & Co.")).toEqual([48, 48 + 34 + 7]);
        expect(at("TAX INVOICE")?.[1]).toBe(50);
    });

    it("without a logo the name sits at the top, as before", async () => {
        const text = jest.spyOn(PDFDocument.prototype, "text");
        const { sizes } = read(await renderInvoicePdf(VIEW));
        expect(sizes).toEqual([]);
        expect(
            text.mock.calls.find(([t]) => t === "Rye & Co.")?.slice(1, 3),
        ).toEqual([48, 48]);
    });

    it.each([
        ["a WebP", WEBP],
        ["a PNG whose pixels are not zlib", png(8, Buffer.from("broken"))],
        [
            "a PNG with a filter PNG does not know",
            png(8, deflateSync(Buffer.alloc(8 * 33, 0x80))),
        ],
    ])(
        "%s is left off; the PDF still renders, with a warning",
        async (_, logo) => {
            const file = await renderInvoicePdf(VIEW, {
                logo,
                organizationId: ORG,
            });
            // A broken PNG would throw on a later tick: let it.
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(file.subarray(0, 5).toString()).toBe("%PDF-");
            const { text, sizes } = read(file);
            expectHeader(text);
            expect(sizes).toEqual([]);
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(
                    /^invoice_pdf_logo_skipped: .*org_rye.*reason undecodable/,
                ),
            );
        },
    );
});
