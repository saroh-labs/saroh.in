import { describe, expect, it } from "vitest";

import { CUSTOMERS } from "@/content/customers";
import { LEGAL_PAGES } from "@/content/resources";
import { TERMS } from "@/content/terms";
import { parseLegal } from "@/lib/legal-markdown";
import { indexedPaths } from "@/lib/site-pages";

import { prefilledSite, reportBody, reportProblem } from "./business-report";

const GOOD = {
    site: "rye.saroh.app",
    message: "Paid for a cake that never came.",
    email: "",
};

describe("reportProblem", () => {
    it("lets a good report go, with or without an email", () => {
        expect(reportProblem(GOOD)).toBeNull();
        expect(reportProblem({ ...GOOD, email: "me@example.com" })).toBeNull();
        expect(
            reportProblem({ ...GOOD, site: "https://Shop.example.com/x?y=1" }),
        ).toBeNull();
    });

    it("names the field that is wrong", () => {
        expect(reportProblem({ ...GOOD, site: "" })).toBe("site");
        expect(reportProblem({ ...GOOD, site: "the cake shop" })).toBe("site");
        expect(reportProblem({ ...GOOD, message: "bad" })).toBe("message");
        expect(reportProblem({ ...GOOD, email: "nope" })).toBe("email");
    });
});

describe("reportBody", () => {
    it("keeps only the three fields", () => {
        expect(
            reportBody({ ...GOOD, email: " me@example.com ", other: 1 }),
        ).toEqual({
            site: GOOD.site,
            message: GOOD.message,
            email: "me@example.com",
        });
        expect(reportBody(GOOD)).toEqual({
            site: GOOD.site,
            message: GOOD.message,
        });
    });

    it("is null for anything that isn't a report", () => {
        expect(reportBody(null)).toBeNull();
        expect(reportBody({ site: "rye.saroh.app" })).toBeNull();
    });
});

describe("prefilledSite", () => {
    it("reads the merchant site's ?site=", () => {
        expect(prefilledSite("?site=rye.saroh.app")).toBe("rye.saroh.app");
        expect(prefilledSite("")).toBe("");
        expect(prefilledSite(`?site=${"a".repeat(300)}`)).toBe("");
    });
});

describe("/customers", () => {
    it("is in the sitemap in either launch mode", () => {
        expect(indexedPaths("waitlist")).toContain("/customers");
        expect(indexedPaths("open")).toContain("/customers");
    });

    it("says who is responsible, in the page's own sections", () => {
        const headings = parseLegal(CUSTOMERS.body).flatMap((b) =>
            b.kind === "heading" ? [b.text] : [],
        );
        expect(headings).toEqual([
            "The business is responsible for your order",
            "Contact the business first",
            "Report a business",
        ]);
        expect(CUSTOMERS.body).toContain(
            "Saroh can't refund, change or cancel an order or a booking.",
        );
    });
});

describe("the Terms' 9 Oct additions (rev 46)", () => {
    const blocks = parseLegal(TERMS.body);
    const headings = blocks.flatMap((b) =>
        b.kind === "heading" ? [b.text] : [],
    );
    const after = (heading: string) => headings[headings.indexOf(heading) + 1];

    it("puts the new sections where the owner's text has them", () => {
        expect(after("Money you take")).toBe(
            "Your customers and your business",
        );
        expect(after("What you can't do")).toBe("Fair use");
        expect(after("Fair use")).toBe("Your website and domain");
    });

    it("carries the owner's words verbatim", () => {
        for (const words of [
            "Saroh is software a business uses to run its shop, bookings and website. Each business sells its own goods and services, sets its own prices and policies, and deals with its own customers. Saroh isn't a party to those sales. We don't check or guarantee any business, what it sells or what it says, and we don't verify a business's identity, licences or registrations. You're responsible for your orders, bookings, refunds and complaints, and for the laws that apply to your business. We're responsible for Saroh itself.",
            "We may suspend or close an account at once, without notice, and stop the people behind it from using Saroh again, if we reasonably believe it's used for something illegal, for fraud or to harm customers, or if the law or a payment provider requires it. We may report it to the authorities.",
            "Plans with \"no limit\", or with large allowances, are for the normal running of one business. Don't resell Saroh, run several businesses' worth of traffic or storage on one account, send automated bulk messages, or use Saroh as file hosting. If an account uses far more than a typical business on its plan, or puts Saroh at risk for others, we'll contact you to agree a way forward before limiting anything, unless we need to act at once to keep Saroh running.",
            "We're not responsible for the goods, services, conduct or content of any business that uses Saroh, or for disputes between a business and its customers.",
        ]) {
            expect(
                blocks.some((b) => b.kind === "paragraph" && b.text === words),
            ).toBe(true);
        }
    });

    it("moves the page's Last updated to 9 Oct", () => {
        expect(LEGAL_PAGES.find((p) => p.id === "terms")?.publishOn).toBe(
            "2026-10-09",
        );
    });
});
