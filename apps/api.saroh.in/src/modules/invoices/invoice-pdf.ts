import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Logger } from "@nestjs/common";
import PDFDocument from "pdfkit";

import type { PaperLook, PaperView } from "./invoice-paper-view";
import { paperLook } from "./invoice-paper-view";
import type { ParsedPng } from "./invoice-pdf-logo";
import { pngDecodes, warnLogoSkipped } from "./invoice-pdf-logo";
import { PLAIN_PAPER } from "./paper-styles";

/**
 * An issued invoice's paper as a PDF (D16, default 37): drawn on request
 * from the same paper view Invoice Detail prints, and never stored.
 *
 * pdfkit is pure JavaScript, so the API image needs nothing native. The text
 * is Noto Sans (OFL, `assets/fonts`), embedded and subset: the standard PDF
 * fonts have no ₹. Noto Sans Devanagari sits beside it when Hindi comes.
 *
 * A4, dark ink on white. A long invoice runs onto more pages: the table's
 * heading repeats under a "continued" line, and every page is numbered.
 *
 * Three styles (DEC-173, #1118), frozen on the invoice at issue
 * (`view.look`): Classic, today's paper, with the business's colour on
 * the title and the heavy rules; Band, its colour across the top of the
 * first page with the seller and the number on it in ink or white,
 * whichever reads; Compact, smaller rows and the seller and the buyer side
 * by side, for long trade orders. Every style draws every particular CGST
 * Rule 46 asks for (`RULE_46_FIELDS`); the spec checks each.
 *
 * The business logo, when it has one pdfkit can print, sits above its name
 * as on the paper: a rounded square twice the name's height, cropped to
 * fill. `invoice-pdf-logo.ts` reads it; one that will not decode is left
 * off here, and the PDF still goes out.
 */

const logger = new Logger("InvoicePdf");

/** `assets/fonts` beside `src` and `dist`: `modules/invoices` is two deep. */
const FONT_DIR = join(__dirname, "..", "..", "..", "assets", "fonts");

let fonts: { regular: Buffer; bold: Buffer } | null = null;

/**
 * Read once, on the first PDF: most processes never draw one. Shared with
 * the QR print files (`sites/qr-print.ts`), so the process holds one copy.
 */
export function loadFonts(): { regular: Buffer; bold: Buffer } {
    fonts ??= {
        regular: readFileSync(join(FONT_DIR, "NotoSans-Regular.ttf")),
        bold: readFileSync(join(FONT_DIR, "NotoSans-Bold.ttf")),
    };
    return fonts;
}

const INK = "#1c1c19";
const MUTED = "#66655e";
const RULE = "#d8d5cb";

const MARGIN = 48;
/** Room kept under the content for the page number. */
const FOOT = 40;

const COL = { hsn: 70, qty: 40, rate: 70, amount: 84, gap: 10 } as const;

/**
 * The paper's logo is 40px, rounded 8px, 8px above its 20px name; here the
 * name is 17pt, so the logo is 34pt, rounded 7pt, 7pt above it.
 */
const NAME_SIZE = 17;
const LOGO = { size: NAME_SIZE * 2, radius: 7, gap: 7 } as const;

/** "KD/26-27/0012" → "KD-26-27-0012.pdf": the invoice number, safe to save. */
export function pdfFileName(number: string): string {
    const safe = number
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return `${safe || "invoice"}.pdf`;
}

export interface InvoicePdfOptions {
    /** PNG or JPEG bytes of the business logo; left off when absent. */
    logo?: Buffer | null;
    /** Names the business in the log line when its logo cannot be drawn. */
    organizationId?: string;
    /**
     * Leave the drawing uncompressed, so a test can read the colours it
     * was drawn in. Every PDF a reader gets is compressed.
     */
    compress?: boolean;
}

export function renderInvoicePdf(
    view: PaperView,
    options: InvoicePdfOptions = {},
): Promise<Buffer> {
    const { regular, bold } = loadFonts();
    const doc = new PDFDocument({
        size: "A4",
        compress: options.compress ?? true,
        margins: {
            top: MARGIN,
            bottom: MARGIN,
            left: MARGIN,
            right: MARGIN,
        },
        bufferPages: true,
        info: {
            Title: `${view.title} ${view.number}`,
            // The business's paper, never Saroh's brand (a customer's PDF
            // reader shows these): the seller made it.
            Author: view.seller.name,
            Creator: view.seller.name,
            Producer: view.seller.name,
        },
    });
    doc.registerFont("Regular", regular);
    doc.registerFont("Bold", bold);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    const logo = options.logo ? openLogo(doc, options.logo) : null;
    if (options.logo && !logo) {
        warnLogoSkipped(logger, options.organizationId ?? "-", "undecodable");
    }
    draw(doc, view, logo);
    doc.end();
    return done;
}

type Doc = PDFKit.PDFDocument;

/** pdfkit's parsed image: `openImage` is public but untyped. */
export interface OpenedImage {
    width: number;
    height: number;
    /** png-js's parse, on a PNG. */
    image?: Partial<ParsedPng>;
}

/**
 * Parse the logo before anything is drawn, so an image whose signature
 * passed but whose data is broken leaves the page untouched.
 */
export function openLogo(doc: Doc, bytes: Buffer): OpenedImage | null {
    try {
        const image = (
            doc as Doc & { openImage(src: Buffer): OpenedImage }
        ).openImage(bytes);
        if (!(image.width > 0 && image.height > 0)) return null;
        const png = image.image;
        if (png?.imgData && !pngDecodes(png as ParsedPng)) return null;
        return image;
    } catch {
        return null;
    }
}

/** The logo, cropped to fill a rounded square (the paper's `object-cover`). */
function drawLogo(doc: Doc, image: OpenedImage, x: number, y: number) {
    doc.save();
    doc.roundedRect(x, y, LOGO.size, LOGO.size, LOGO.radius).clip();
    // pdfkit draws an already-opened image as it draws bytes.
    doc.image(image as unknown as Buffer, x, y, {
        cover: [LOGO.size, LOGO.size],
        align: "center",
        valign: "center",
    });
    doc.restore();
}

/** A style's sizes: Compact is smaller, for long trade orders, still A4. */
interface Metrics {
    /** The seller's name, in points. */
    name: number;
    /** A line's description and quantity. */
    body: number;
    /** A line's sub line and its code. */
    sub: number;
    /** Room above and below a line's text in the table. */
    rowPad: number;
    /** The least a line's text takes. */
    rowMin: number;
    /** The seller's and the buyer's detail lines. */
    detail: number;
}

const METRICS: Record<PaperLook["style"], Metrics> = {
    CLASSIC: {
        name: NAME_SIZE,
        body: 10,
        sub: 8.5,
        rowPad: 14,
        rowMin: 13,
        detail: 9,
    },
    BAND: {
        name: NAME_SIZE,
        body: 10,
        sub: 8.5,
        rowPad: 14,
        rowMin: 13,
        detail: 9,
    },
    COMPACT: { name: 14, body: 9, sub: 8, rowPad: 8, rowMin: 11, detail: 8.5 },
};

/** One run of text in a stacked column, drawn or only measured. */
interface Piece {
    text: string;
    font: "Regular" | "Bold";
    size: number;
    color: string;
    /** Room above it. */
    gap?: number;
    spacing?: number;
}

/**
 * Lay `pieces` out top to bottom from `y` in a column `width` wide and
 * return where they end. With `paint` false nothing is drawn: Band measures
 * its header first, so the band is filled before its text goes on it.
 */
function stack(
    doc: Doc,
    pieces: Piece[],
    x: number,
    y: number,
    width: number,
    align: "left" | "right",
    paint: boolean,
): number {
    let at = y;
    for (const p of pieces) {
        at += p.gap ?? 0;
        doc.font(p.font).fontSize(p.size);
        const options = {
            width,
            align,
            characterSpacing: p.spacing ?? 0,
            lineGap: 1.5,
        };
        if (paint) {
            doc.fillColor(p.color).text(p.text, x, at, options);
            at = doc.y;
        } else {
            at += doc.heightOfString(p.text, options);
        }
    }
    return at;
}

/** The seller's block under its name: legal name, address, email, GSTIN. */
function sellerPieces(
    view: PaperView,
    m: Metrics,
    ink: string,
    muted: string,
): Piece[] {
    const pieces: Piece[] = [
        { text: view.seller.name, font: "Bold", size: m.name, color: ink },
    ];
    for (const [n, line] of [...view.seller.lines, view.seller.tax].entries()) {
        pieces.push({
            text: line,
            font: "Regular",
            size: m.detail,
            color: muted,
            gap: n === 0 ? 2 : 0,
        });
    }
    if (view.seller.product) {
        pieces.push({
            text: view.seller.product,
            font: "Regular",
            size: m.detail - 0.5,
            color: muted,
            gap: 3,
        });
    }
    return pieces;
}

/** What it is, its number, its dates and status: the header's right side. */
function titlePieces(
    view: PaperView,
    titleColour: string,
    ink: string,
    muted: string,
): Piece[] {
    const pieces: Piece[] = [
        {
            text: view.title.toUpperCase(),
            font: "Bold",
            size: 8,
            color: titleColour,
            spacing: 0.8,
            gap: 2,
        },
        {
            text: view.number,
            font: "Regular",
            size: 12.5,
            color: ink,
            gap: 3,
        },
    ];
    let first = true;
    for (const line of [view.dates, view.related]) {
        if (!line) continue;
        pieces.push({
            text: line,
            font: "Regular",
            size: 9,
            color: muted,
            gap: first ? 2 : 0,
        });
        first = false;
    }
    if (view.status) {
        pieces.push({
            text: view.status,
            font: "Bold",
            size: 9,
            color: ink,
            gap: 2,
        });
    }
    return pieces;
}

function draw(doc: Doc, view: PaperView, logo: OpenedImage | null): void {
    // Saroh's own invoices to businesses carry no look: Classic in ink.
    const look = view.look ?? paperLook(PLAIN_PAPER);
    const m = METRICS[look.style];
    // The colour as text and heavy rules: ink when none is chosen, else the
    // business's, moved until it reads on white (`invoice-paper.ts`).
    const accent = look.accent;
    const titleColour = look.coloured ? accent : MUTED;

    const left = MARGIN;
    const width = doc.page.width - MARGIN * 2;
    const bottom = () => doc.page.height - MARGIN - FOOT;
    const rule = (y: number, weight: number, color: string) =>
        doc
            .moveTo(left, y)
            .lineTo(left + width, y)
            .lineWidth(weight)
            .strokeColor(color)
            .stroke();
    const label = (text: string, x: number, at: number, w: number) => {
        doc.font("Bold")
            .fontSize(7.5)
            .fillColor(look.coloured ? accent : MUTED)
            .text(text.toUpperCase(), x, at, {
                width: w,
                characterSpacing: 0.8,
            });
        return doc.y + 3;
    };

    const rightW = 190;
    const leftW = width - rightW - 16;
    const rx = left + width - rightW;
    let y = MARGIN;

    if (look.style === "BAND" && look.band) {
        // ── Band: the business's colour across the top of the page, the
        // seller and what it is on it in the tone that reads there ───────
        const { fill, text } = look.band;
        const pad = 26;
        const top = pad;
        const logoH = logo ? LOGO.size + LOGO.gap : 0;
        const sellerOn = sellerPieces(view, m, text, text);
        const titleOn = titlePieces(view, text, text, text);
        const leftEnd = stack(
            doc,
            sellerOn,
            left,
            top + logoH,
            leftW,
            "left",
            false,
        );
        const rightEnd = stack(doc, titleOn, rx, top, rightW, "right", false);
        const bandH = Math.max(leftEnd, rightEnd) + pad;
        doc.save();
        doc.rect(0, 0, doc.page.width, bandH).fill(fill);
        doc.restore();
        if (logo) drawLogo(doc, logo, left, top);
        stack(doc, sellerOn, left, top + logoH, leftW, "left", true);
        stack(doc, titleOn, rx, top, rightW, "right", true);
        y = Math.max(bandH + 18, MARGIN);
    } else if (look.style === "COMPACT") {
        // ── Compact: the name and what it is on one line, then the seller
        // and the buyer side by side ───────────────────────────────────
        const logoSize = 26;
        let nameX = left;
        if (logo) {
            doc.save();
            doc.roundedRect(left, y, logoSize, logoSize, 5).clip();
            doc.image(logo as unknown as Buffer, left, y, {
                cover: [logoSize, logoSize],
                align: "center",
                valign: "center",
            });
            doc.restore();
            nameX += logoSize + 8;
        }
        doc.font("Bold")
            .fontSize(m.name)
            .fillColor(INK)
            .text(view.seller.name, nameX, y + (logo ? 4 : 0), {
                width: leftW - (nameX - left),
            });
        const ly = Math.max(doc.y, logo ? y + logoSize : 0);
        const ry = stack(
            doc,
            titlePieces(view, titleColour, INK, MUTED),
            rx,
            y - 2,
            rightW,
            "right",
            true,
        );
        y = Math.max(ly, ry) + 8;
        rule(y, 1.5, accent);
        y += 10;

        const colW = (width - 24) * (view.placeOfSupply ? 0.38 : 0.5);
        const buyerX = left + colW + 12;
        let fy = label("From", left, y, colW);
        fy = stack(
            doc,
            [...view.seller.lines, view.seller.tax].map((text) => ({
                text,
                font: "Regular" as const,
                size: m.detail,
                color: MUTED,
            })),
            left,
            fy,
            colW,
            "left",
            true,
        );
        if (view.seller.product) {
            fy = stack(
                doc,
                [
                    {
                        text: view.seller.product,
                        font: "Regular",
                        size: m.detail - 0.5,
                        color: MUTED,
                        gap: 2,
                    },
                ],
                left,
                fy,
                colW,
                "left",
                true,
            );
        }
        let by = label("Billed to", buyerX, y, colW);
        by = buyerBlock(doc, view, m, buyerX, by, colW);
        let py = y;
        if (view.placeOfSupply) {
            const px = buyerX + colW + 12;
            const pw = left + width - px;
            py = label("Place of supply", px, y, pw);
            doc.font("Regular")
                .fontSize(m.detail)
                .fillColor(INK)
                .text(view.placeOfSupply, px, py, { width: pw });
            py = doc.y;
        }
        y = Math.max(fy, by, py) + 12;
    } else {
        // ── Classic: the seller on the left, what it is on the right ─────
        let nameY = y;
        if (logo) {
            drawLogo(doc, logo, left, y);
            nameY += LOGO.size + LOGO.gap;
        }
        const ly = stack(
            doc,
            sellerPieces(view, m, INK, MUTED),
            left,
            nameY,
            leftW,
            "left",
            true,
        );
        const ry = stack(
            doc,
            titlePieces(view, titleColour, INK, MUTED),
            rx,
            y,
            rightW,
            "right",
            true,
        );
        y = Math.max(ly, ry) + 12;
        rule(y, 1.5, accent);
        y += 12;
    }

    if (look.style !== "COMPACT") {
        // ── Billed to, and the place of supply on a tax invoice ─────────
        const billW = view.placeOfSupply ? width * 0.55 : width;
        let by = label("Billed to", left, y, billW);
        by = buyerBlock(doc, view, m, left, by, billW);
        let py = y;
        if (view.placeOfSupply) {
            const px = left + width * 0.6;
            const pw = width * 0.4;
            py = label("Place of supply", px, y, pw);
            doc.font("Regular")
                .fontSize(10)
                .fillColor(INK)
                .text(view.placeOfSupply, px, py, { width: pw });
            py = doc.y;
        }
        y = Math.max(by, py) + 14;
    }

    // ── The lines ──────────────────────────────────────────────────────
    // A rate column only where the paper asks for one (Saroh's own).
    const rateW = view.table?.rate ? COL.rate + COL.gap : 0;
    const itemW = width - COL.hsn - COL.qty - COL.amount - COL.gap * 3 - rateW;
    const hsnX = left + itemW + COL.gap;
    const qtyX = hsnX + COL.hsn + COL.gap;
    const rateX = qtyX + COL.qty + COL.gap;
    const amountX = qtyX + COL.qty + COL.gap + rateW;
    const half = m.rowPad / 2;

    const tableHead = (at: number): number => {
        rule(at, 0.75, RULE);
        const hy = at + (look.style === "COMPACT" ? 5 : 7);
        doc.font("Bold").fontSize(7.5).fillColor(MUTED);
        const head = { characterSpacing: 0.5 };
        doc.text("ITEM", left, hy, { ...head, width: itemW });
        if (view.hsnColumn) {
            doc.text(view.table?.code ?? "HSN / SAC", hsnX, hy, {
                ...head,
                width: COL.hsn,
            });
        }
        doc.text("QTY", qtyX, hy, { ...head, width: COL.qty, align: "right" });
        if (rateW) {
            doc.text("RATE", rateX, hy, {
                ...head,
                width: COL.rate,
                align: "right",
            });
        }
        doc.text(view.table?.amount ?? "AMOUNT", amountX, hy, {
            ...head,
            width: COL.amount,
            align: "right",
        });
        const end = doc.y + (look.style === "COMPACT" ? 4 : 6);
        rule(end, 0.75, RULE);
        return end;
    };
    const continued = (): number => {
        doc.addPage();
        doc.font("Regular")
            .fontSize(9)
            .fillColor(MUTED)
            .text(`${view.title} ${view.number}, continued`, left, MARGIN, {
                width,
            });
        return doc.y + 10;
    };

    y = tableHead(y);
    for (const line of view.lines) {
        doc.font("Regular").fontSize(m.body);
        const descH = doc.heightOfString(line.description, { width: itemW });
        doc.fontSize(m.sub);
        const subH = line.sub
            ? doc.heightOfString(line.sub, { width: itemW }) + 1
            : 0;
        const h = Math.max(descH + subH, m.rowMin) + m.rowPad;
        if (y + h > bottom()) y = tableHead(continued());

        const ty = y + half;
        doc.font("Regular")
            .fontSize(m.body)
            .fillColor(INK)
            .text(line.description, left, ty, { width: itemW });
        if (line.sub) {
            doc.fontSize(m.sub)
                .fillColor(MUTED)
                .text(line.sub, left, ty + descH + 1, { width: itemW });
        }
        if (line.hsn) {
            doc.fontSize(m.sub)
                .fillColor(MUTED)
                .text(line.hsn, hsnX, ty + 1.5, { width: COL.hsn });
        }
        doc.fontSize(m.body)
            .fillColor(INK)
            .text(line.quantity, qtyX, ty, { width: COL.qty, align: "right" });
        if (rateW && line.rate) {
            doc.text(line.rate, rateX, ty, { width: COL.rate, align: "right" });
        }
        doc.font("Bold").text(line.amount, amountX, ty, {
            width: COL.amount,
            align: "right",
        });
        y += h;
        rule(y, 0.5, RULE);
    }

    // ── The sums, the total and the law it is issued under ──────────────
    doc.font("Regular").fontSize(8.5);
    const footerH = doc.heightOfString(view.footer, { width });
    const signatureH = view.signature ? 52 : 0;
    const needed =
        10 +
        view.sums.length * 15 +
        34 +
        (view.inclusive ? 14 : 0) +
        signatureH +
        20 +
        footerH;
    if (y + needed > bottom()) y = continued();

    const sumW = 220;
    const sx = left + width - sumW;
    y += 10;
    for (const [k, v] of view.sums) {
        doc.font("Regular").fontSize(9.5).fillColor(INK);
        doc.text(k, sx, y, { width: sumW / 2 });
        doc.text(v, sx + sumW / 2, y, { width: sumW / 2, align: "right" });
        y += 15;
    }
    if (view.sums.length) y += 4;
    doc.moveTo(sx, y)
        .lineTo(sx + sumW, y)
        .lineWidth(1.5)
        .strokeColor(accent)
        .stroke();
    y += 7;
    doc.font("Bold").fontSize(13).fillColor(INK);
    doc.text(view.totalLabel, sx, y, { width: sumW / 2 });
    doc.text(view.total, sx + sumW / 2, y, { width: sumW / 2, align: "right" });
    y = doc.y + 3;
    if (view.inclusive) {
        doc.font("Regular")
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(view.inclusive, sx, y, { width: sumW });
        y = doc.y;
    }

    // ── Who signs it (CGST Rule 46(q)), on Saroh's own invoices ─────────
    if (view.signature) {
        y += 16;
        doc.font("Bold")
            .fontSize(9)
            .fillColor(INK)
            .text(view.signature.for, left, y, { width, align: "right" });
        y = doc.y + 1;
        doc.font("Regular")
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(view.signature.role, left, y, { width, align: "right" });
        y = doc.y + 1;
        doc.text(view.signature.note, left, y, { width, align: "right" });
        y = doc.y;
    }

    // ── How to pay us, on an unpaid invoice (#833) ──────────────────────
    if (view.howToPay) {
        doc.font("Regular").fontSize(9);
        const payH = view.howToPay.reduce(
            (h, line) => h + doc.heightOfString(line, { width }) + 2,
            0,
        );
        y += 18;
        if (y + 14 + payH + 20 + footerH > bottom()) y = continued();
        y = label("How to pay us", left, y, width);
        for (const line of view.howToPay) {
            doc.font("Regular")
                .fontSize(9)
                .fillColor(INK)
                .text(line, left, y, { width, lineGap: 1.5 });
            y = doc.y + 2;
        }
    }

    y += 18;
    doc.moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.75)
        .dash(2, { space: 2 })
        .strokeColor(RULE)
        .stroke()
        .undash();
    doc.font("Regular")
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(view.footer, left, y + 9, { width, lineGap: 1.5 });

    numberPages(doc, view, left, width);
}

/** The buyer: name, then address or email, then GSTIN. Returns its end. */
function buyerBlock(
    doc: Doc,
    view: PaperView,
    m: Metrics,
    x: number,
    y: number,
    width: number,
): number {
    doc.font("Bold")
        .fontSize(m.body + 1)
        .fillColor(INK)
        .text(view.billedTo.name, x, y, { width });
    let by = doc.y + 1;
    if (view.billedTo.detail) {
        doc.font("Regular")
            .fontSize(m.detail)
            .fillColor(MUTED)
            .text(view.billedTo.detail, x, by, { width, lineGap: 1.5 });
        by = doc.y;
    }
    if (view.billedTo.gstin) {
        doc.font("Regular")
            .fontSize(m.detail)
            .fillColor(INK)
            .text(`GSTIN ${view.billedTo.gstin}`, x, by + 2, { width });
        by = doc.y;
    }
    return by;
}

/** "KD/26-27/0012 · page 1 of 2", on a paper that runs past one page. */
function numberPages(doc: Doc, view: PaperView, left: number, width: number) {
    const { start, count } = doc.bufferedPageRange();
    if (count < 2) return;
    for (let n = 0; n < count; n++) {
        doc.switchToPage(start + n);
        // Below the bottom margin: without this pdfkit would start a page.
        const margin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font("Regular")
            .fontSize(8)
            .fillColor(MUTED)
            .text(
                `${view.number} · page ${n + 1} of ${count}`,
                left,
                doc.page.height - MARGIN - 10,
                { width, align: "right", lineBreak: false },
            );
        doc.page.margins.bottom = margin;
    }
}
