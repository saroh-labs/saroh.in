import { crc32, deflateRawSync } from "node:zlib";

import { esc } from "@/lib/escape-xml";
import type { DocumentView } from "@/lib/tools/document";
import { columnsOf } from "@/lib/tools/document";
import { parseNumber } from "@/lib/tools/money";

/**
 * Word and Excel files, written by hand as saroh.in's download files are: a zip
 * of a few XML parts. Build-time only (node:zlib), never import from a page.
 */
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const PKG = "http://schemas.openxmlformats.org/package/2006";
const DOC_REL =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** A zip with fixed dates, so a run writes the same bytes. */
export function zip(parts: Record<string, string>): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(parts)) {
        const raw = Buffer.from(text, "utf8");
        const packed = deflateRawSync(raw);
        const file = Buffer.from(name, "utf8");
        const head = Buffer.alloc(26);
        head.writeUInt16LE(20, 0); // version needed
        head.writeUInt16LE(0x0800, 2); // UTF-8 names
        head.writeUInt16LE(8, 4); // deflate
        head.writeUInt16LE(0, 6); // time
        head.writeUInt16LE(((2026 - 1980) << 9) | (11 << 5) | 2, 8); // date
        head.writeUInt32LE(crc32(raw), 10);
        head.writeUInt32LE(packed.length, 14);
        head.writeUInt32LE(raw.length, 18);
        head.writeUInt16LE(file.length, 22);
        const local = Buffer.concat([
            Buffer.from([0x50, 0x4b, 3, 4]),
            head,
            file,
            packed,
        ]);
        const tail = Buffer.alloc(14);
        tail.writeUInt32LE(offset, 10);
        centrals.push(
            Buffer.concat([
                Buffer.from([0x50, 0x4b, 1, 2, 20, 0]),
                head,
                tail,
                file,
            ]),
        );
        locals.push(local);
        offset += local.length;
    }
    const central = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(centrals.length, 8);
    end.writeUInt16LE(centrals.length, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, central, end]);
}

const types = (overrides: [string, string][]) =>
    `${XML}<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides
        .map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`)
        .join("")}</Types>`;

const rels = (items: [string, string][]) =>
    `${XML}<Relationships xmlns="${PKG}/relationships">${items
        .map(
            ([type, target], i) =>
                `<Relationship Id="rId${i + 1}" Type="${DOC_REL}/${type}" Target="${target}"/>`,
        )
        .join("")}</Relationships>`;

export type Paper = "a4" | "letter";

const PAGE = {
    a4: { w: 11906, h: 16838 },
    letter: { w: 12240, h: 15840 },
};
const MARGIN = 1134;

const run = (text: string, bold = false, size = 21) =>
    `<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (
    text: string,
    o: { bold?: boolean; size?: number; right?: boolean; after?: number } = {},
) =>
    `<w:p><w:pPr><w:spacing w:after="${o.after ?? 60}"/>${o.right ? '<w:jc w:val="right"/>' : ""}</w:pPr>${run(text, o.bold, o.size)}</w:p>`;

const cell = (width: number, body: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${body || "<w:p/>"}</w:tc>`;

function table(widths: number[], rows: string[][], lines = true): string {
    const border = (name: string) =>
        `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="BBB8AF"/>`;
    const borders = lines
        ? `<w:tblBorders>${border("bottom")}${border("insideH")}</w:tblBorders>`
        : "";
    const total = widths.reduce((a, b) => a + b, 0);
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths
        .map((w) => `<w:gridCol w:w="${w}"/>`)
        .join("")}</w:tblGrid>${rows
        .map(
            (cells) =>
                `<w:tr>${cells.map((c, i) => cell(widths[i], c)).join("")}</w:tr>`,
        )
        .join("")}</w:tbl>`;
}

const headersOf = (v: DocumentView) => ({
    qty: v.headers?.qty ?? "Qty",
    rate: v.headers?.rate ?? "Rate",
    amount: v.headers?.amount ?? "Amount",
});

/** The same words as the preview and the PDF, in a file Word can edit. */
export function docx(v: DocumentView, paper: Paper = "a4"): Buffer {
    const { w, h } = PAGE[paper];
    const width = w - 2 * MARGIN;
    const head = headersOf(v);
    const columns = columnsOf(v);
    const third = Math.floor(width / columns.length);
    const rowWidths = [width - 3400, 1200, 1100, 1100];
    const body = [
        para(v.heading, { bold: true, size: 44, right: true }),
        para(v.number, { right: true }),
        ...(v.stamp ? [para(v.stamp, { bold: true, right: true })] : []),
        para("", { after: 120 }),
        table(
            columns.map(() => third),
            [
                columns.map((c) =>
                    [
                        ...(c.label ? [para(c.label, { bold: true })] : []),
                        ...c.lines.map((l) => para(l)),
                    ].join(""),
                ),
            ],
            false,
        ),
        para("", { after: 120 }),
        ...(v.rows.length
            ? [
                  table(rowWidths, [
                      [
                          para("Description", { bold: true }),
                          para(head.qty, { bold: true }),
                          para(head.rate, { bold: true, right: true }),
                          para(head.amount, { bold: true, right: true }),
                      ],
                      ...v.rows.map((r) => [
                          para(r.description),
                          para(r.qty),
                          para(r.rate, { right: true }),
                          para(r.amount, { right: true }),
                      ]),
                  ]),
              ]
            : []),
        para("", { after: 120 }),
        ...(v.totals.length
            ? [
                  table(
                      [width - 4600, 2800, 1800],
                      v.totals.map((t) => [
                          "",
                          para(t.label, { bold: t.strong }),
                          para(t.value, { bold: t.strong, right: true }),
                      ]),
                      false,
                  ),
              ]
            : []),
        para("", { after: 120 }),
        ...v.blocks.flatMap((b) => [
            ...(b.label ? [para(b.label, { bold: true })] : []),
            ...b.lines.flatMap((l) => l.split("\n")).map((l) => para(l)),
            para("", { after: 80 }),
        ]),
        ...(v.signLine
            ? [
                  para("", { after: 400 }),
                  para(
                      "Client signature: ______________________   Date: __________",
                  ),
              ]
            : []),
    ].join("");
    return zip({
        "[Content_Types].xml": types([
            [
                "/word/document.xml",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            ],
        ]),
        "_rels/.rels": rels([["officeDocument", "word/document.xml"]]),
        "word/document.xml": `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    });
}

/** Style numbers in styles.xml below. */
const S = { text: 0, bold: 1, money: 2, boldMoney: 3, title: 4 };

const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="20"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const textCell = (ref: string, value: string, style = S.text) =>
    value === ""
        ? ""
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;

const numberCell = (ref: string, value: number, style = S.money, f?: string) =>
    `<c r="${ref}" s="${style}">${f ? `<f>${esc(f)}</f>` : ""}<v>${Number(value.toFixed(2))}</v></c>`;

/**
 * A sheet that does the sums: each amount is qty x rate, and the totals are
 * formulas, so changing a line changes the total.
 */
export function xlsx(v: DocumentView): Buffer {
    const rows: string[] = [];
    const add = (cells: (r: number) => string) => {
        const r = rows.length + 1;
        rows.push(`<row r="${r}">${cells(r)}</row>`);
        return r;
    };
    const head = headersOf(v);
    add((r) => textCell(`A${r}`, v.heading, S.title));
    add((r) => textCell(`A${r}`, v.number));
    if (v.stamp) add((r) => textCell(`A${r}`, v.stamp ?? "", S.bold));
    add(() => "");
    for (const p of v.parties) {
        add((r) => textCell(`A${r}`, p.label, S.bold));
        for (const line of p.lines) add((r) => textCell(`A${r}`, line));
        add(() => "");
    }
    for (const f of v.facts) {
        add(
            (r) =>
                textCell(`A${r}`, f.label, S.bold) + textCell(`B${r}`, f.value),
        );
    }
    add(() => "");
    add(
        (r) =>
            textCell(`A${r}`, "Description", S.bold) +
            textCell(`B${r}`, head.qty, S.bold) +
            textCell(`C${r}`, head.rate, S.bold) +
            textCell(`D${r}`, head.amount, S.bold),
    );
    const first = rows.length + 1;
    for (const row of v.rows) {
        const qty = Number(row.qty.replace(/,/g, ""));
        add((r) =>
            row.rate && Number.isFinite(qty)
                ? textCell(`A${r}`, row.description) +
                  numberCell(`B${r}`, qty, S.text) +
                  numberCell(`C${r}`, parseNumber(row.rate)) +
                  numberCell(
                      `D${r}`,
                      parseNumber(row.amount),
                      S.money,
                      `B${r}*C${r}`,
                  )
                : textCell(`A${r}`, row.description) +
                  textCell(`B${r}`, row.qty) +
                  numberCell(`D${r}`, parseNumber(row.amount)),
        );
    }
    const last = rows.length;
    add(() => "");

    let subtotalRow = 0;
    const additive: number[] = [];
    let finished = false;
    for (const t of v.totals) {
        const value = parseNumber(t.value);
        const signed = t.value.includes("−") ? -value : value;
        const label = (r: number) =>
            textCell(`C${r}`, t.label, t.strong ? S.bold : S.text);
        const style = t.strong ? S.boldMoney : S.money;
        const rate = /([\d.]+)%$/.exec(t.label)?.[1];
        if (finished) {
            add((r) => label(r) + numberCell(`D${r}`, signed, style));
        } else if (t.label === "Subtotal") {
            subtotalRow = add(
                (r) =>
                    label(r) +
                    numberCell(
                        `D${r}`,
                        signed,
                        style,
                        `SUM(D${first}:D${last})`,
                    ),
            );
            additive.push(subtotalRow);
        } else if (t.strong || t.label === "Total") {
            const sum = additive.map((a) => `D${a}`).join("+");
            add((r) => label(r) + numberCell(`D${r}`, signed, style, sum));
            if (t.strong) finished = true;
        } else {
            additive.push(
                add(
                    (r) =>
                        label(r) +
                        numberCell(
                            `D${r}`,
                            signed,
                            style,
                            rate && subtotalRow
                                ? `D${subtotalRow}*${rate}/100`
                                : undefined,
                        ),
                ),
            );
        }
    }
    if (v.totals.length) add(() => "");
    for (const b of v.blocks) {
        if (b.label) add((r) => textCell(`A${r}`, b.label, S.bold));
        for (const line of b.lines.flatMap((l) => l.split("\n"))) {
            add((r) => textCell(`A${r}`, line));
        }
    }
    return zip({
        "[Content_Types].xml": types([
            [
                "/xl/workbook.xml",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
            ],
            [
                "/xl/worksheets/sheet1.xml",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
            ],
            [
                "/xl/styles.xml",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
            ],
        ]),
        "_rels/.rels": rels([["officeDocument", "xl/workbook.xml"]]),
        "xl/workbook.xml": `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC_REL}"><sheets><sheet name="${esc(v.heading.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": rels([
            ["worksheet", "worksheets/sheet1.xml"],
            ["styles", "styles.xml"],
        ]),
        "xl/styles.xml": STYLES,
        "xl/worksheets/sheet1.xml": `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="26" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData></worksheet>`,
    });
}
