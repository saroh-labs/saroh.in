import { readFileSync } from "node:fs";
import { join } from "node:path";

import PDFDocument from "pdfkit";

import type { PaperView } from "./invoice-paper-view";

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
 */

/** `assets/fonts` beside `src` and `dist`: `modules/invoices` is two deep. */
const FONT_DIR = join(__dirname, "..", "..", "..", "assets", "fonts");

let fonts: { regular: Buffer; bold: Buffer } | null = null;

/** Read once, on the first PDF: most processes never draw one. */
function loadFonts(): { regular: Buffer; bold: Buffer } {
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

const COL = { hsn: 70, qty: 40, amount: 84, gap: 10 } as const;

/** "KD/26-27/0012" → "KD-26-27-0012.pdf": the invoice number, safe to save. */
export function pdfFileName(number: string): string {
    const safe = number
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return `${safe || "invoice"}.pdf`;
}

export function renderInvoicePdf(view: PaperView): Promise<Buffer> {
    const { regular, bold } = loadFonts();
    const doc = new PDFDocument({
        size: "A4",
        margins: {
            top: MARGIN,
            bottom: MARGIN,
            left: MARGIN,
            right: MARGIN,
        },
        bufferPages: true,
        info: {
            Title: `${view.title} ${view.number}`,
            Author: view.seller.name,
            Creator: "Saroh",
            Producer: "Saroh",
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

    draw(doc, view);
    doc.end();
    return done;
}

type Doc = PDFKit.PDFDocument;

function draw(doc: Doc, view: PaperView): void {
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

    // ── Header: the seller on the left, what it is on the right ──────────
    const rightW = 190;
    const leftW = width - rightW - 16;
    const rx = left + width - rightW;
    let y = MARGIN;

    doc.font("Bold")
        .fontSize(17)
        .fillColor(INK)
        .text(view.seller.name, left, y, { width: leftW });
    let ly = doc.y + 2;
    doc.font("Regular").fontSize(9).fillColor(MUTED);
    for (const line of [...view.seller.lines, view.seller.tax]) {
        doc.text(line, left, ly, { width: leftW, lineGap: 1.5 });
        ly = doc.y;
    }

    let ry = y + 2;
    doc.font("Bold")
        .fontSize(8)
        .fillColor(MUTED)
        .text(view.title.toUpperCase(), rx, ry, {
            width: rightW,
            align: "right",
            characterSpacing: 0.8,
        });
    ry = doc.y + 3;
    doc.font("Regular")
        .fontSize(12.5)
        .fillColor(INK)
        .text(view.number, rx, ry, { width: rightW, align: "right" });
    ry = doc.y + 2;
    doc.fontSize(9).fillColor(MUTED);
    for (const line of [view.dates, view.related]) {
        if (!line) continue;
        doc.text(line, rx, ry, { width: rightW, align: "right" });
        ry = doc.y;
    }

    y = Math.max(ly, ry) + 12;
    rule(y, 1.5, INK);
    y += 12;

    // ── Billed to, and the place of supply on a tax invoice ─────────────
    const billW = view.placeOfSupply ? width * 0.55 : width;
    const label = (text: string, x: number, at: number, w: number) => {
        doc.font("Bold")
            .fontSize(7.5)
            .fillColor(MUTED)
            .text(text.toUpperCase(), x, at, {
                width: w,
                characterSpacing: 0.8,
            });
        return doc.y + 3;
    };
    let by = label("Billed to", left, y, billW);
    doc.font("Bold")
        .fontSize(11)
        .fillColor(INK)
        .text(view.billedTo.name, left, by, { width: billW });
    by = doc.y + 1;
    if (view.billedTo.detail) {
        doc.font("Regular")
            .fontSize(9)
            .fillColor(MUTED)
            .text(view.billedTo.detail, left, by, {
                width: billW,
                lineGap: 1.5,
            });
        by = doc.y;
    }
    if (view.billedTo.gstin) {
        doc.font("Regular")
            .fontSize(9)
            .fillColor(INK)
            .text(`GSTIN ${view.billedTo.gstin}`, left, by + 2, {
                width: billW,
            });
        by = doc.y;
    }
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

    // ── The lines ──────────────────────────────────────────────────────
    const itemW = width - COL.hsn - COL.qty - COL.amount - COL.gap * 3;
    const hsnX = left + itemW + COL.gap;
    const qtyX = hsnX + COL.hsn + COL.gap;
    const amountX = qtyX + COL.qty + COL.gap;

    const tableHead = (at: number): number => {
        rule(at, 0.75, RULE);
        const hy = at + 7;
        doc.font("Bold").fontSize(7.5).fillColor(MUTED);
        const head = { characterSpacing: 0.5 };
        doc.text("ITEM", left, hy, { ...head, width: itemW });
        if (view.hsnColumn) {
            doc.text("HSN / SAC", hsnX, hy, { ...head, width: COL.hsn });
        }
        doc.text("QTY", qtyX, hy, { ...head, width: COL.qty, align: "right" });
        doc.text("AMOUNT", amountX, hy, {
            ...head,
            width: COL.amount,
            align: "right",
        });
        const end = doc.y + 6;
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
        doc.font("Regular").fontSize(10);
        const descH = doc.heightOfString(line.description, { width: itemW });
        doc.fontSize(8.5);
        const subH = line.sub
            ? doc.heightOfString(line.sub, { width: itemW }) + 1
            : 0;
        const h = Math.max(descH + subH, 13) + 14;
        if (y + h > bottom()) y = tableHead(continued());

        const ty = y + 7;
        doc.font("Regular")
            .fontSize(10)
            .fillColor(INK)
            .text(line.description, left, ty, { width: itemW });
        if (line.sub) {
            doc.fontSize(8.5)
                .fillColor(MUTED)
                .text(line.sub, left, ty + descH + 1, { width: itemW });
        }
        if (line.hsn) {
            doc.fontSize(8.5)
                .fillColor(MUTED)
                .text(line.hsn, hsnX, ty + 1.5, { width: COL.hsn });
        }
        doc.fontSize(10)
            .fillColor(INK)
            .text(line.quantity, qtyX, ty, { width: COL.qty, align: "right" });
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
    const needed =
        10 +
        view.sums.length * 15 +
        34 +
        (view.inclusive ? 14 : 0) +
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
        .strokeColor(INK)
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
