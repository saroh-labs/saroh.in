import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCT_STATUS_WORD } from "./status-word";

const ROOT = path.resolve(__dirname, "../..");

/** Every product screen that says a product's status in a word. */
const SCREENS = [
    "components/stores/catalogue/tones.ts",
    "components/stores/catalogue/catalogue-toolbar.tsx",
    "components/commerce/product-page/header.tsx",
    "components/commerce/product-page/sheets/details-sheet.tsx",
    "components/commerce/product-page/archived-banner.tsx",
    "components/commerce/product-page/customer-view.tsx",
    "components/commerce/product-editor-v2/visibility-section.tsx",
    "components/commerce/collections/products-picker.tsx",
    "components/sites/selling-sections/product-grid.tsx",
    "lib/products/overview-words.ts",
    "lib/imports/review.ts",
];

describe("a product's status word", () => {
    it("is Live, Draft and Archived today, in one place", () => {
        expect(PRODUCT_STATUS_WORD).toEqual({
            PUBLISHED: "Live",
            DRAFT: "Draft",
            ARCHIVED: "Archived",
        });
    });

    it.each(SCREENS)("%s reads it, and never spells Archived itself", (rel) => {
        const code = readFileSync(path.join(ROOT, rel), "utf8");
        expect(code).toContain("PRODUCT_STATUS_WORD");
        // The word as a label or a sentence's opening state ("Archived",
        // "Archived. …"), outside comments; "Archived it." is the verb.
        const live = code
            .split("\n")
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join("\n");
        expect(live).not.toMatch(/["'`]Archived[.,"'`]/);
    });
});
