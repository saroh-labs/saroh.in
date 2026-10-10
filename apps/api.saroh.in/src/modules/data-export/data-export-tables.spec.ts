/**
 * The export's files and their cells, without a database (DEC-120): what
 * each CSV is read from, what is left out, how a cell is written, and the
 * zip a big file streams into. The rows themselves are in
 * `data-export.db.spec.ts`.
 */
import { Prisma } from "@saroh/database";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    columnsOf,
    csvCell,
    EXPORT_TABLES,
    isOmitted,
} from "./data-export-tables";
import { ZipFile } from "./zip-file";

describe("the export's tables", () => {
    it("covers what the owner asked for", () => {
        expect(EXPORT_TABLES.map((t) => t.file)).toEqual(
            expect.arrayContaining([
                "customers.csv",
                "orders.csv",
                "order-lines.csv",
                "invoices-and-credit-notes.csv",
                "bookings.csv",
                "products.csv",
                "product-variants.csv",
                "stock.csv",
                "memberships.csv",
                "class-pack-purchases.csv",
                "course-enrolments.csv",
                "leads.csv",
                "enquiries.csv",
            ]),
        );
        expect(new Set(EXPORT_TABLES.map((t) => t.file)).size).toBe(
            EXPORT_TABLES.length,
        );
    });

    it.each(EXPORT_TABLES.map((t) => [t.file, t] as const))(
        "%s reads only its own business, by id, and no secret column",
        (_file, table) => {
            const where = JSON.stringify(table.where("org_1"));
            expect(where).toContain('"organizationId":"org_1"');
            const columns = columnsOf(table.model).map((c) => c.name);
            expect(columns).toContain("id");
            expect(columns.filter(isOmitted)).toEqual([]);
            expect(columns.join(",")).not.toMatch(
                /Hash|Token|Secret|idempotencyKey|checkoutKey/,
            );
        },
    );

    it("leaves hashes, tokens and keys out, and keeps what a person reads", () => {
        for (const name of [
            "payTokenHash",
            "ipHash",
            "checkoutKey",
            "idempotencyKey",
            "encryptedCredentials",
            "webhookSecret",
        ]) {
            expect([name, isOmitted(name)]).toEqual([name, true]);
        }
        for (const name of ["email", "total", "key", "notes", "status"]) {
            expect([name, isOmitted(name)]).toEqual([name, false]);
        }
    });
});

describe("csvCell", () => {
    it("writes dates, money and empties as a sheet reads them", () => {
        expect(csvCell(null)).toBe("");
        expect(csvCell(new Date("2026-10-09T05:30:00Z"))).toBe(
            "2026-10-09T05:30:00.000Z",
        );
        expect(csvCell(new Prisma.Decimal("-12.50"))).toBe("-12.5");
        expect(csvCell(-5)).toBe("-5");
        expect(csvCell(true)).toBe("true");
        expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
        expect(csvCell(["PICKUP", "DELIVERY"], true)).toBe("PICKUP; DELIVERY");
    });

    it("quotes commas, quotes and line breaks", () => {
        expect(csvCell('Rao, "Ash"', true)).toBe('"Rao, ""Ash"""');
        expect(csvCell("two\nlines", true)).toBe('"two\nlines"');
    });

    it("keeps text a sheet would run as a formula as text", () => {
        for (const bad of ["=1+1", "+91 98", "-cmd", "@SUM(A1)", "\tx"]) {
            expect(csvCell(bad, true).replace(/^"/, "")).toMatch(/^'/);
        }
        expect(csvCell("Asha", true)).toBe("Asha");
    });
});

describe("ZipFile", () => {
    it("streams entries to disk one at a time and reads back whole", async () => {
        const path = join(tmpdir(), `zip-file-spec-${process.pid}.zip`);
        try {
            const zip = new ZipFile(path);
            const big = "row,of,data\r\n".repeat(50_000);
            async function* pages() {
                for (let i = 0; i < 10; i++) {
                    yield big.slice(
                        (i * big.length) / 10,
                        ((i + 1) * big.length) / 10,
                    );
                    await Promise.resolve();
                }
            }
            expect(await zip.add("a.csv", pages(), { compress: true })).toBe(
                big.length,
            );
            await zip.add("media/p.png", [new Uint8Array([1, 2, 3])], {
                compress: false,
            });
            await zip.add("empty.csv", [], { compress: true });
            const size = await zip.close();
            const bytes = readFileSync(path);
            expect(bytes.byteLength).toBe(size);
            const files = unzipSync(bytes);
            expect(strFromU8(files["a.csv"])).toBe(big);
            expect([...files["media/p.png"]]).toEqual([1, 2, 3]);
            expect(files["empty.csv"].byteLength).toBe(0);
        } finally {
            await rm(path, { force: true });
        }
    });
});
