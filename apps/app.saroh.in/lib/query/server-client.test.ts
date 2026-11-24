/**
 * The server's QueryClient is scoped to the request (DEC-259): the module
 * is server-only, the client is made inside React's `cache()`, and no
 * module in `lib/query` holds a client at module scope, which would hand
 * one person's rows to the next request.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname);
const source = (file: string) => readFileSync(path.join(DIR, file), "utf8");

describe("server QueryClient", () => {
    it("is server-only and made inside cache()", () => {
        const src = source("server-client.ts");
        expect(src.startsWith('import "server-only";')).toBe(true);
        expect(src).toMatch(/=\s*cache\(makeQueryClient\)/);
    });

    it("no module-scope client anywhere in lib/query", () => {
        const files = readdirSync(DIR).filter(
            (f) => /\.tsx?$/.test(f) && !f.includes(".test."),
        );
        for (const file of files) {
            // A client made at the top level of a module, not inside a function.
            expect(source(file), file).not.toMatch(
                /^(export\s+)?(const|let|var)\s+\w+\s*(:[^=]+)?=\s*new QueryClient/m,
            );
        }
    });
});
