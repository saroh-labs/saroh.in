import { describe, expect, it } from "vitest";

import { CUSTOMERS } from "@/content/customers";
import { LEGAL_PAGES } from "@/content/resources";
import { TERMS } from "@/content/terms";
import { parseLegal } from "@/lib/legal-markdown";
import { indexedPaths } from "@/lib/site-pages";

import {
    phoneOk,
    prefilledSite,
    reportBody,
    reportProblem,
} from "./business-report";

const GOOD = {
    site: "rye.saroh.app",
    message: "Paid for a cake that never came.",
    email: "first.last@example.com",
    phone: "+91 98450 12345",
};
const NOTHING = { site: "", message: "", email: "", phone: "" };

describe("reportProblem", () => {
    it("lets a good report go", () => {
        expect(reportProblem(GOOD)).toBeNull();
        expect(
            reportProblem({ ...GOOD, site: "https://Shop.example.com/x?y=1" }),
        ).toBeNull();
        expect(reportProblem({ ...GOOD, phone: "9845012345" })).toBeNull();
    });

    it("names the field that is wrong", () => {
        expect(reportProblem({ ...GOOD, site: "" })).toBe("site");
        expect(reportProblem({ ...GOOD, site: "the cake shop" })).toBe("site");
        expect(reportProblem({ ...GOOD, message: "bad" })).toBe("message");
        expect(reportProblem({ ...GOOD, email: "nope" })).toBe("email");
        expect(reportProblem({ ...GOOD, phone: "call me" })).toBe("phone");
    });

    it("needs the email and the mobile number (DEC-138)", () => {
        expect(reportProblem({ ...GOOD, email: "" })).toBe("email");
        expect(reportProblem({ ...GOOD, email: "  " })).toBe("email");
        expect(reportProblem({ ...GOOD, phone: "" })).toBe("phone");
        expect(reportProblem({ ...GOOD, phone: "  " })).toBe("phone");
    });

    it("names the first field at fault, in the form's order", () => {
        expect(reportProblem(NOTHING)).toBe("site");
        expect(reportProblem({ ...NOTHING, site: GOOD.site })).toBe("message");
        expect(reportProblem({ ...GOOD, email: "", phone: "" })).toBe("email");
    });
});

/**
 * The same lists as the API's `common/customer-phone.spec.ts`: the page and
 * the server must agree on every one.
 */
describe("phoneOk", () => {
    it("takes a number as people write one", () => {
        for (const phone of [
            "9845012345",
            "+91 98450 12345",
            "(080) 4099-2210",
            " 022 4000 0000 ",
        ]) {
            expect(phoneOk(phone)).toBe(true);
        }
    });

    it("refuses nothing, words, too few digits and punctuation alone", () => {
        for (const phone of [
            "",
            "   ",
            "call me",
            "12345",
            "------",
            "98450x12345",
            "9".repeat(25),
        ]) {
            expect(phoneOk(phone)).toBe(false);
        }
    });
});

describe("reportBody", () => {
    it("keeps only the four fields, trimmed", () => {
        expect(
            reportBody({
                ...GOOD,
                email: " first.last@example.com ",
                phone: " +91 98450 12345 ",
                other: 1,
            }),
        ).toEqual(GOOD);
    });

    it("leaves a field that is missing or isn't text empty, to be named", () => {
        expect(reportBody(null)).toEqual(NOTHING);
        expect(reportBody("report")).toEqual(NOTHING);
        expect(reportBody({ site: "rye.saroh.app", phone: 98450 })).toEqual({
            ...NOTHING,
            site: "rye.saroh.app",
        });
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
            "If we find that an account is used for something the law prohibits, we'll suspend it at once, without notice. We may also suspend or close an account, and stop the people behind it from using Saroh again, if we reasonably believe it's used for fraud or to harm customers, or if the law or a payment provider requires it. We keep a suspended account's data for as long as the law requires, or while it's needed to prevent, detect or investigate an offence, and we give it to courts, the police or other authorities when the law requires us to.",
            "Plans with \"no limit\", or with large allowances, are for the normal running of one business. Don't resell Saroh, run several businesses' worth of traffic or storage on one account, send automated bulk messages, or use Saroh as file hosting. If an account uses far more than a typical business on its plan, or puts Saroh at risk for others, we'll contact you to agree a way forward before limiting anything, unless we need to act at once to keep Saroh running.",
            "We're not responsible for the goods, services, conduct or content of any business that uses Saroh, or for disputes between a business and its customers.",
        ]) {
            expect(
                blocks.some((b) => b.kind === "paragraph" && b.text === words),
            ).toBe(true);
        }
    });

    it("moved the page's Last updated to 10 Oct, and DEC-161 to 14 Oct", () => {
        // 10 Oct for these additions (and the DPDP alignment); 14 Oct for
        // the autopay and price-change sentences (DEC-161).
        expect(LEGAL_PAGES.find((p) => p.id === "terms")?.publishOn).toBe(
            "2026-10-14",
        );
    });
});
