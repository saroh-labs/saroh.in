import { parse } from "csv-parse";

/**
 * The CSV boundary (#175).
 *
 * Everything past this file works with `Record<string, string>` — the messy
 * parts of the format (quoting, embedded newlines, BOM, CRLF) stop here, which
 * is why `import-plan.ts` can stay pure and total.
 *
 * `csv-parse` is used rather than a hand-rolled reader precisely because a real
 * spreadsheet export finds every edge case: a quoted comma in a product
 * description, a doubled quote inside a quoted field, a newline inside an
 * address, a UTF-8 BOM from Excel.
 */

/** Refuse absurd files early rather than after streaming them. */
export const MAX_ROWS = 20_000;

export class CsvFormatError extends Error {}

export interface ParsedCsv {
    /** Column names in file order, as the mapping UI must present them. */
    headers: string[];
    records: Record<string, string>[];
}

/**
 * Parse CSV text into records keyed by header.
 *
 * Rejects — rather than silently repairing — a file with no header, duplicate
 * header names, or more rows than {@link MAX_ROWS}. Duplicate headers matter:
 * keying by name would let one column silently shadow another, and the merchant
 * would never see which of their columns was dropped.
 */
export function parseCsv(text: string): Promise<ParsedCsv> {
    return new Promise((resolve, reject) => {
        const records: Record<string, string>[] = [];
        let headers: string[] = [];

        const parser = parse({
            bom: true, // Excel prefixes a BOM; without this the first header is mangled
            columns: (header: string[]) => {
                const seen = new Set<string>();
                for (const raw of header) {
                    const name = raw.trim();
                    if (name === "") {
                        throw new CsvFormatError(
                            "The header row contains an empty column name",
                        );
                    }
                    if (seen.has(name)) {
                        throw new CsvFormatError(
                            `The header row repeats the column "${name}"`,
                        );
                    }
                    seen.add(name);
                }
                headers = [...seen];
                return headers;
            },
            skip_empty_lines: true,
            trim: false, // trimming is the mapping step's job, per-field
            relax_column_count: false,
        });

        parser.on("readable", () => {
            let record: Record<string, string> | null;
            while ((record = parser.read() as Record<string, string> | null)) {
                if (records.length >= MAX_ROWS) {
                    parser.destroy();
                    reject(
                        new CsvFormatError(
                            `This file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and import in parts.`,
                        ),
                    );
                    return;
                }
                records.push(record);
            }
        });

        parser.on("error", (err) =>
            reject(
                err instanceof CsvFormatError
                    ? err
                    : new CsvFormatError(err.message),
            ),
        );

        parser.on("end", () => {
            if (headers.length === 0) {
                reject(new CsvFormatError("The file is empty"));
                return;
            }
            resolve({ headers, records });
        });

        parser.write(text);
        parser.end();
    });
}
