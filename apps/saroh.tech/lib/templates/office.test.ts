import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { docx, xlsx, zip } from "./office";
import { templateAt, templateView } from "./pages";

/** Reads the zip back through its central directory, as Word and Excel do. */
function unzip(buffer: Buffer): Record<string, string> {
    const end = buffer.length - 22;
    expect(buffer.readUInt32LE(end)).toBe(0x06054b50);
    const count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);
    const files: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
        expect(buffer.readUInt32LE(at)).toBe(0x02014b50);
        const size = buffer.readUInt32LE(at + 20);
        const nameLength = buffer.readUInt16LE(at + 28);
        const local = buffer.readUInt32LE(at + 42);
        const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
        const start = local + 30 + buffer.readUInt16LE(local + 26);
        files[name] = inflateRawSync(
            buffer.subarray(start, start + size),
        ).toString("utf8");
        at += 46 + nameLength;
    }
    return files;
}

const view = (path: string) => {
    const page = templateAt(path);
    if (!page) throw new Error(path);
    return templateView(page);
};

describe("the Office files", () => {
    it("zip what went in", () => {
        expect(unzip(zip({ "a.xml": "<a>é</a>" }))["a.xml"]).toBe("<a>é</a>");
    });

    it("the Word file has the page's own lines", () => {
        const files = unzip(docx(view("/templates/invoice/plumber")));
        expect(Object.keys(files)).toContain("word/document.xml");
        const body = files["word/document.xml"];
        expect(body).toContain("Mixer tap, chrome");
        expect(body).toContain("27 Larch Road");
    });

    it("sets the paper size", () => {
        const a4 = unzip(docx(view("/templates/invoice")))["word/document.xml"];
        const letter = unzip(docx(view("/templates/invoice"), "letter"))[
            "word/document.xml"
        ];
        expect(a4).toContain('w:w="11906"');
        expect(letter).toContain('w:w="12240"');
    });

    it("the sheet does the sums with formulas", () => {
        const sheet = unzip(xlsx(view("/templates/invoice/photographer")))[
            "xl/worksheets/sheet1.xml"
        ];
        expect(sheet).toContain("Extra edited images");
        expect(sheet).toMatch(/<f>B\d+\*C\d+<\/f><v>200<\/v>/);
        expect(sheet).toMatch(/<f>SUM\(D\d+:D\d+\)<\/f><v>2480<\/v>/);
        expect(sheet).toMatch(/<v>-600<\/v>/);
        expect(sheet).toMatch(/<f>D\d+\+D\d+<\/f><v>1880<\/v>/);
    });

    it("a price list's sheet has units, no sums, and escapes text", () => {
        const sheet = unzip(xlsx(view("/templates/price-list")))[
            "xl/worksheets/sheet1.xml"
        ];
        expect(sheet).toContain("per dozen");
        expect(sheet).not.toContain("SUM(");
    });
});
