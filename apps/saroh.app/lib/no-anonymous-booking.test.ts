import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Sign-in is always on (round-2 plan A, A9; ADR-011): no merchant site books
 * through the anonymous route any more. `POST public/services/:id/book`
 * kept serving for the release that moved the booking page, and answers
 * 410 "Sign in to book" since the next (round 2, phase 2). That is only
 * safe while nothing a site renders still calls it — which this pins,
 * across this app and the blocks every site is built from.
 */

const ROOTS = [
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../../../packages/site-blocks/src"),
];

/** The anonymous route, however a URL to it is built. */
const ANONYMOUS_BOOK = /public\/services\/[^\s"'`]*\/book\b/;

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            return [];
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        if (!/\.(ts|tsx)$/.test(entry.name)) return [];
        if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
        return [full];
    });
}

describe("no site code books without signing in", () => {
    it("reads the site's sources", () => {
        const files = ROOTS.flatMap(sources);
        expect(
            files.some((f) => f.endsWith(path.join("book", "actions.ts"))),
        ).toBe(true);
        expect(
            files.some((f) => f.endsWith(path.join("blocks", "booking.tsx"))),
        ).toBe(true);
    });

    it("never calls the anonymous book route", () => {
        const callers = ROOTS.flatMap(sources).filter((file) =>
            ANONYMOUS_BOOK.test(readFileSync(file, "utf8")),
        );
        expect(callers.map((f) => path.relative(ROOTS[0] ?? "", f))).toEqual(
            [],
        );
    });

    it("would catch one", () => {
        expect(
            ANONYMOUS_BOOK.test(
                "fetch(`${apiUrl}/public/services/${encodeURIComponent(id)}/book`)",
            ),
        ).toBe(true);
        expect(
            ANONYMOUS_BOOK.test("`${apiUrl}/public/services/${id}/days`"),
        ).toBe(false);
    });
});
