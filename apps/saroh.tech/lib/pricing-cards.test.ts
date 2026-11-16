import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Plans } from "@/components/pricing/plans";

import { pricingModel } from "./plans";

describe("the pricing cards (Global, Free-only, KTD7)", () => {
    it("show Grow and Pro as Coming soon, with no amount without a catalogue, and Tell me when", () => {
        const html = renderToStaticMarkup(
            createElement(Plans, { model: pricingModel(null), on: false }),
        );
        expect(html.match(/Coming soon/g)).toHaveLength(2);
        expect(html.match(/Tell me when/g)).toHaveLength(2);
        expect(html).toContain('data-cta="tell-me-when-grow"');
        expect(html).toContain('data-cta="tell-me-when-pro"');
        expect(html).not.toMatch(/\$\s?\d|₹|USD/);
    });

    it("give Grow and Pro a Start button to sign-up once paid plans are on sale (#45)", () => {
        const html = renderToStaticMarkup(
            createElement(Plans, { model: pricingModel(null), on: true }),
        );
        expect(html).not.toMatch(/Not available yet|Tell me when/);
        expect(html).toContain("Start on Grow");
        expect(html).toContain("Start on Pro");
        expect(html).toContain('data-cta="plan-grow"');
        expect(html).toContain("plan=grow");
    });
});
