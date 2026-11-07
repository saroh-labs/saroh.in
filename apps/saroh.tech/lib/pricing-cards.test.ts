import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Plans } from "@/components/pricing/plans";

import { pricingModel } from "./plans";

describe("the pricing cards (Global, Free-only, KTD7)", () => {
    it("show Grow and Pro as Not available yet, with no amount, and Tell me when", () => {
        const html = renderToStaticMarkup(
            createElement(Plans, { model: pricingModel(null) }),
        );
        expect(html.match(/Not available yet/g)).toHaveLength(2);
        expect(html.match(/Tell me when/g)).toHaveLength(2);
        expect(html).toContain('data-cta="tell-me-when-grow"');
        expect(html).toContain('data-cta="tell-me-when-pro"');
        expect(html).not.toMatch(/\$\s?\d|₹|USD/);
    });
});
