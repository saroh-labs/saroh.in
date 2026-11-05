import { describe, expect, it } from "vitest";

import { embeddedDocs } from "./docs-embedded";
import { docLinks } from "./docs-links";
import type { DocPage } from "./docs-load";

const page = (path: string): DocPage => {
    const p = embeddedDocs.all().find((x) => x.path === path);
    if (!p) throw new Error(`no ${path}`);
    return p;
};

describe("docLinks (U12)", () => {
    it("a guide's link in its words is required", () => {
        expect(docLinks(page("/guides/reduce-no-shows"))).toEqual({
            required: ["/tools/cancellation-policy-generator"],
            optional: [
                "/guides/booking-deposits",
                "/guides/waitlist-for-cancelled-slots",
            ],
        });
    });

    it("Help links and other site pages are not search pages", () => {
        const all = embeddedDocs.all().flatMap((p) => {
            const l = docLinks(p);
            return [...l.required, ...l.optional];
        });
        expect(all.some((x) => x.startsWith("/help/"))).toBe(false);
        expect(
            all.every((x) =>
                /^\/(for|tools|gst|guides|downloads)\/[a-z0-9-]+$/.test(x),
            ),
        ).toBe(true);
    });

    it("a GST page's rail tools, trade page and related pins are optional", () => {
        expect(docLinks(page("/gst/salon-and-beauty-services"))).toEqual({
            required: [],
            optional: [
                "/for/salons",
                "/gst/gym-and-fitness",
                "/gst/tax-invoice-or-bill-of-supply",
                "/gst/yoga-and-dance-classes",
                "/tools/gst-calculator",
                "/tools/gst-invoice-generator",
            ],
        });
    });

    it("finds a link in a frontmatter field and a question's answer, never in sources", () => {
        const p = structuredClone(page("/gst/do-i-need-gst"));
        if (p.kind !== "gst") throw new Error("not gst");
        p.mistakes[0] = {
            title: "x",
            body: "See [it](/tools/upi-qr-code-generator#top).",
        };
        p.questions[0] = {
            question: "q",
            answer: ["Read [this](/gst/clothes)."],
        };
        p.sources = [{ label: "x", href: "https://cbic-gst.gov.in/for/x" }];
        expect(docLinks(p).required).toEqual([
            "/gst/clothes",
            "/tools/upi-qr-code-generator",
        ]);
    });

    it("never lists the page itself", () => {
        const p = structuredClone(page("/downloads/receipt-format"));
        p.questions = [
            { question: "q", answer: ["[me](/downloads/receipt-format)"] },
        ];
        expect(docLinks(p).required).toEqual(["/downloads/gst-invoice-format"]);
    });
});
