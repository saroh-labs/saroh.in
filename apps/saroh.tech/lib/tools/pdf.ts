import type { jsPDF as JsPdf } from "jspdf";

import type { DocumentView } from "./document";

/**
 * The PDF's built-in font draws Western European characters only. A name in
 * another script would come out as garbage, so the page says to use Print
 * instead, which uses the browser's own fonts.
 * shortcut: embed a full font (about 1 MB) if people need other scripts in the PDF.
 */
const SAFE = /^[\n\x20-\x7E\xA0-\xFF€–—‘’“”•…−×›]*$/;

const allText = (v: DocumentView) => [
    v.heading,
    v.number,
    ...v.parties.flatMap((p) => p.lines),
    ...v.facts.map((f) => f.value),
    ...v.rows.flatMap((r) => [r.description, r.qty]),
    ...v.extras.map((e) => e.description),
    ...v.totals.map((t) => t.label),
    ...v.blocks.flatMap((b) => b.lines),
];

export const canDrawPdf = (v: DocumentView) =>
    allText(v).every((t) => SAFE.test(t));

const MARGIN = 48;
const INK = "#1C1C1A";
const QUIET = "#55544E";
const LINE = "#D9D6CC";

/** The PDF font has no "−", so a minus sign is drawn as a hyphen. */
const clean = (s: string) => s.replace(/−/g, "-");

/** Draws one document on an A4 page, and on more if the items run over. */
export function drawPdf(
    Pdf: typeof JsPdf,
    v: DocumentView,
    format: "a4" | "letter" = "a4",
): JsPdf {
    const doc = new Pdf({ unit: "pt", format, compress: false });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const right = width - MARGIN;
    const compact = v.style === "compact";
    const step = compact ? 13 : 16;
    const size = compact ? 9.5 : 10.5;
    let y = MARGIN;

    const room = (needed: number) => {
        if (y + needed <= height - MARGIN) return;
        doc.addPage();
        y = MARGIN;
    };
    const font = (weight: "normal" | "bold", pt = size, colour = INK) => {
        doc.setFont("helvetica", weight);
        doc.setFontSize(pt);
        doc.setTextColor(colour);
    };

    const bold = v.style === "bold";
    if (bold) {
        doc.setFillColor(INK);
        doc.rect(0, 0, width, 104, "F");
    }
    const headColour = bold ? "#F5F2EC" : INK;
    if (v.logo) {
        doc.addImage(v.logo, MARGIN, y - 4, 48, 48, undefined, "FAST");
    }
    font("bold", 26, headColour);
    doc.text(v.heading, right, y + 14, { align: "right" });
    font("normal", size, bold ? "#D8D5CC" : QUIET);
    doc.text(clean(v.number), right, y + 32, { align: "right" });
    if (v.stamp) {
        font("bold", 12, "#7A3E0C");
        doc.text(v.stamp, right, y + 50, { align: "right" });
    }
    y += bold ? 80 : compact ? 64 : 76;

    const col = (right - MARGIN) / 3;
    const columns = [
        ...v.parties,
        ...(v.facts.length
            ? [
                  {
                      label: "",
                      lines: v.facts.map((f) => `${f.label}: ${f.value}`),
                  },
              ]
            : []),
    ];
    let tallest = 0;
    columns.forEach((c, i) => {
        const x = MARGIN + i * col;
        let at = y;
        if (c.label) {
            font("bold");
            doc.text(c.label, x, at);
            at += step;
        }
        font("normal");
        for (const line of c.lines.flatMap(
            (l) => doc.splitTextToSize(clean(l), col - 12) as string[],
        )) {
            doc.text(line, x, at);
            at += step;
        }
        tallest = Math.max(tallest, at - y);
    });
    y += tallest + (compact ? 10 : 18);

    const qtyAt = right - 190;
    const rateAt = right - 90;
    const descWidth = qtyAt - MARGIN - 16;
    const header = () => {
        font("bold");
        doc.text("Description", MARGIN, y);
        doc.text(v.headers?.qty ?? "Qty", qtyAt, y);
        doc.text(v.headers?.rate ?? "Rate", rateAt, y, { align: "right" });
        doc.text(v.headers?.amount ?? "Amount", right, y, { align: "right" });
        y += 6;
        doc.setDrawColor(INK);
        doc.line(MARGIN, y, right, y);
        y += step;
    };
    if (v.rows.length) header();
    for (const row of v.rows) {
        font("normal");
        const lines = doc.splitTextToSize(
            clean(row.description) || " ",
            descWidth,
        ) as string[];
        const tall = lines.length * step + 2;
        if (y + tall > height - MARGIN) {
            doc.addPage();
            y = MARGIN;
            header();
            font("normal");
        }
        doc.text(lines, MARGIN, y);
        doc.text(clean(row.qty), qtyAt, y);
        doc.text(row.rate, rateAt, y, { align: "right" });
        doc.text(row.amount, right, y, { align: "right" });
        y += tall - 6;
        doc.setDrawColor(LINE);
        doc.line(MARGIN, y, right, y);
        y += step;
    }

    if (v.extras.length) {
        room(step * (v.extras.length + 2));
        font("bold");
        doc.text("Optional extras (not in the total)", MARGIN, y);
        y += step;
        font("normal");
        for (const e of v.extras) {
            room(step);
            doc.text(clean(e.description), MARGIN, y);
            doc.text(clean(e.amount), right, y, { align: "right" });
            y += step;
        }
        y += 6;
    }

    const labelAt = right - 230;
    room(step * (v.totals.length + 1));
    for (const t of v.totals) {
        room(step + 8);
        if (t.strong) {
            doc.setDrawColor(INK);
            doc.line(labelAt, y - step + 4, right, y - step + 4);
            y += 2;
            font("bold", size + 2.5);
        } else font("normal");
        doc.text(clean(t.label), labelAt, y);
        doc.text(clean(t.value), right, y, { align: "right" });
        y += step + (t.strong ? 6 : 0);
    }
    y += 8;

    for (const b of v.blocks) {
        const lines = b.lines.flatMap(
            (l) => doc.splitTextToSize(clean(l), right - MARGIN) as string[],
        );
        room(step * (lines.length + 2));
        doc.setDrawColor(LINE);
        doc.line(MARGIN, y, right, y);
        y += step;
        if (b.label) {
            font("bold");
            doc.text(b.label, MARGIN, y);
            y += step;
        }
        font("normal");
        doc.text(lines, MARGIN, y);
        y += lines.length * step + 4;
    }

    if (v.signLine) {
        room(60);
        y += 36;
        doc.setDrawColor(INK);
        doc.line(MARGIN, y, MARGIN + 220, y);
        doc.line(MARGIN + 250, y, MARGIN + 390, y);
        y += 13;
        font("normal", size - 1, QUIET);
        doc.text("Client signature", MARGIN, y);
        doc.text("Date", MARGIN + 250, y);
    }
    return doc;
}

/** The library is fetched here, on the first Download, not with the page. */
export async function downloadPdf(view: DocumentView): Promise<void> {
    const { jsPDF } = await import("jspdf");
    drawPdf(jsPDF, view).save(view.fileName);
}
