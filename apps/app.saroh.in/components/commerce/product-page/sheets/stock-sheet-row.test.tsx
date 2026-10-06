import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SheetSize } from "@/lib/products/stock-sheet";

import { SheetSizeRow } from "./stock-sheet-row";

/**
 * A size in the stock sheet on a phone (T7): the size on its own line
 * beside a 44px remove button, then price, on hand and warn at in thirds,
 * each labelled — the desk's column heads are hidden there.
 */
const SIZE: SheetSize = {
    variantId: "v_1",
    title: "800g",
    sku: null,
    price: "480",
    warn: "6",
    removed: false,
    shelves: [
        {
            storeId: "s_1",
            name: "Hill Road",
            onHand: "22",
            was: 22,
            promised: 0,
        },
    ],
};

const row = (counts: boolean) =>
    renderToStaticMarkup(
        <SheetSizeRow
            size={SIZE}
            index={0}
            counts={counts}
            split={false}
            canWrite
            hasVariants
            productPrice="450"
            symbol="₹"
            onSize={() => undefined}
            onPrice={() => undefined}
            onShelf={() => undefined}
        />,
    );

describe("SheetSizeRow on a phone", () => {
    it("labels price, on hand and warn at with visible text tied to each box", () => {
        const out = row(true);
        for (const [text, spoken] of [
            ["Price", "800g price, blank for the product&#x27;s"],
            ["On hand", "800g on hand"],
            ["Warn at", "800g warn when on hand reaches"],
        ]) {
            const label = new RegExp(
                `<label for="([^"]+)"[^>]*>${text}</label>`,
            ).exec(out);
            expect(label, text).not.toBeNull();
            expect(label?.[0]).toContain("sm:hidden");
            const input = new RegExp(
                `<input[^>]*id="${label?.[1] ?? ""}"[^>]*>`,
            ).exec(out);
            expect(input?.[0]).toContain(`aria-label="${spoken}"`);
        }
    });

    it("puts the size on its own line, remove beside it at 44px", () => {
        const out = row(true);
        expect(out).toContain("grid-cols-[repeat(3,minmax(0,1fr))_44px]");
        const name = /<input[^>]*aria-label="Size 1 name"[^>]*>/.exec(out);
        expect(name?.[0]).toContain("col-span-3 sm:col-span-1");
        const removes = out.match(
            /<button[^>]*aria-label="Remove 800g"[^>]*>/g,
        );
        expect(removes).toHaveLength(2);
        expect(removes?.[0]).toContain("size-11 sm:hidden");
        expect(removes?.[1]).toContain("sm:inline-flex");
        // The phone's remove follows the name; the desk's ends the row.
        expect(out.indexOf("size-11 sm:hidden")).toBeLessThan(
            out.indexOf('for="'),
        );
    });

    it("an untracked size has just its labelled price", () => {
        const out = row(false);
        expect(out).toMatch(/<label for="[^"]+"[^>]*>Price<\/label>/);
        expect(out).not.toContain("On hand");
        expect(out).toContain("grid-cols-[minmax(0,1fr)_44px]");
    });
});
