import { CsvFormatError, MAX_ROWS, parseCsv } from "./csv";

describe("parseCsv", () => {
    it("reads headers and records", async () => {
        const { headers, records } = await parseCsv(
            "Name,Price\nChair,20.00\nDesk,99.50\n",
        );
        expect(headers).toEqual(["Name", "Price"]);
        expect(records).toEqual([
            { Name: "Chair", Price: "20.00" },
            { Name: "Desk", Price: "99.50" },
        ]);
    });

    it("handles a quoted comma", async () => {
        const { records } = await parseCsv(
            'Name,Description\nChair,"Oak, stained"\n',
        );
        expect(records[0].Description).toBe("Oak, stained");
    });

    it("handles a doubled quote inside a quoted field", async () => {
        const { records } = await parseCsv(
            'Name,Description\nChair,"A 24"" seat"\n',
        );
        expect(records[0].Description).toBe('A 24" seat');
    });

    it("handles a newline inside a quoted field", async () => {
        const { records } = await parseCsv(
            'Name,Address\nPriya,"12 Main St\nMumbai"\n',
        );
        expect(records).toHaveLength(1);
        expect(records[0].Address).toBe("12 Main St\nMumbai");
    });

    it("strips the BOM Excel writes, so the first header is not mangled", async () => {
        const { headers } = await parseCsv("﻿Name,Price\nChair,20\n");
        expect(headers[0]).toBe("Name");
    });

    it("handles CRLF line endings", async () => {
        const { records } = await parseCsv("Name,Price\r\nChair,20\r\n");
        expect(records).toEqual([{ Name: "Chair", Price: "20" }]);
    });

    it("skips blank lines", async () => {
        const { records } = await parseCsv("Name\nChair\n\nDesk\n");
        expect(records).toHaveLength(2);
    });

    it("preserves a header row with no data rows, so mapping can still be shown", async () => {
        const { headers, records } = await parseCsv("Name,Price\n");
        expect(headers).toEqual(["Name", "Price"]);
        expect(records).toEqual([]);
    });

    it("rejects an empty file", async () => {
        await expect(parseCsv("")).rejects.toBeInstanceOf(CsvFormatError);
    });

    it("rejects a repeated column name rather than silently shadowing one", async () => {
        await expect(parseCsv("Name,Name\nA,B\n")).rejects.toThrow(
            /repeats the column "Name"/,
        );
    });

    it("rejects an empty column name", async () => {
        await expect(parseCsv("Name,,Price\nA,B,C\n")).rejects.toThrow(
            /empty column name/,
        );
    });

    it("rejects a row with the wrong number of columns", async () => {
        await expect(parseCsv("Name,Price\nChair\n")).rejects.toBeInstanceOf(
            CsvFormatError,
        );
    });

    it("rejects a file over the row cap", async () => {
        const body = "Name\n" + "Chair\n".repeat(MAX_ROWS + 1);
        await expect(parseCsv(body)).rejects.toThrow(/more than/);
    });

    it("does not trim values — that is the mapping step's job", async () => {
        const { records } = await parseCsv("Name\n  Chair  \n");
        expect(records[0].Name).toBe("  Chair  ");
    });
});
