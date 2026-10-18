import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DUMMY_PHONE, dummyPhone } from "./helpers";

/**
 * The seeds never write a real person's phone or inbox (see `DUMMY_PHONE` in
 * `helpers.ts`; the database side is `showcase/contact-check.ts`). This reads
 * their source, so a number typed into a footer, a post or a fixture fails
 * here before anything is seeded.
 */

const SEED_DIR = __dirname;
const DRAWN = join(__dirname, "../../../../scripts/demo-assets");

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.(ts|mjs)$/.test(name) && !name.endsWith(".test.ts")
            ? [path]
            : [];
    });
}

const files = [...sources(SEED_DIR), ...sources(DRAWN)].map((path) => ({
    path: path.slice(path.lastIndexOf("/seed/") + 1),
    text: readFileSync(path, "utf8"),
}));

/** Every match of `re` in every seed source, as "file: match". */
const found = (re: RegExp) =>
    files.flatMap(({ path, text }) =>
        Array.from(text.matchAll(re), (m) => `${path}: ${m[0]}`),
    );

describe("seeded contact details", () => {
    it("reads the seed sources", () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it("prints every +91 number as +91 00000 NNNNN (or its E.164)", () => {
        const phones = found(/(\+91|wa\.me\/91)[ -]*\d[\d -]*\d/g).filter(
            (hit) =>
                // "+91 00000" alone is this rule written down, not a number.
                hit.replace(/^.*: /, "").replace(/\D/g, "").length >= 10 &&
                !/(\+91 00000 \d{5}|\+9100000\d{5})$/.test(hit),
        );
        expect(phones).toEqual([]);
    });

    it("writes no ten-digit mobile without its +91", () => {
        expect(found(/(?<![\w+-])[6-9]\d{4}[ -]\d{5}(?![\w-])/g)).toEqual([]);
    });

    it("gives every person and business an @example.com inbox", () => {
        const emails = found(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g).filter(
            (hit) =>
                !/@(example\.com|saroh\.dev|removed\.invalid)$/.test(hit) &&
                !/@(prisma|saroh|playwright)\//.test(hit),
        );
        expect(emails).toEqual([]);
    });
});

describe("dummyPhone", () => {
    it("is +91 00000 and five digits, never 0 after the country code by chance", () => {
        expect(dummyPhone("a person")).toMatch(DUMMY_PHONE);
    });

    it("gives a key the same number every time", () => {
        expect(dummyPhone("a drawn mobile")).toBe(dummyPhone("a drawn mobile"));
    });

    it("never gives two keys one number", () => {
        const numbers = new Set(
            Array.from({ length: 5000 }, (_, i) => dummyPhone(`person ${i}`)),
        );
        expect(numbers.size).toBe(5000);
    });

    it("stays above the fixtures' 00001–09999", () => {
        const digits = Number(dummyPhone("anyone").slice(-5));
        expect(digits).toBeGreaterThanOrEqual(10_000);
    });
});
