import { describe, expect, it } from "vitest";

import {
    ACCOUNT_PAGE_TITLES,
    accountMetadata,
    accountPageTitle,
    orderPageTitle,
    receiptTitle,
} from "./account-title";
import { titled } from "./site-meta";

/**
 * The account's titles in each state (DEC-142): the page, then whose site
 * it is, never the customer; "Sign in" when nobody is signed in; and a
 * share card that names the business alone.
 */

const SIGNED_IN = { ok: true } as const;
const SIGNED_OUT = { ok: false, reason: "signed-out" } as const;

/** What the layout's template makes of a page's own words. */
function full(page: string, business: string): string {
    const title = accountMetadata(business).title as {
        template: string;
        default: string;
    };
    return title.template.replace("%s", page);
}

describe("an account page's title", () => {
    it("is the page, then the business: one for each tab", () => {
        const business = "Rye & Co.";
        const titles = Object.fromEntries(
            Object.entries(ACCOUNT_PAGE_TITLES).map(([key, page]) => [
                key,
                full(accountPageTitle(page, SIGNED_IN), business),
            ]),
        );
        expect(titles).toEqual({
            home: "Your account · Rye & Co.",
            orders: "Your orders · Rye & Co.",
            bookings: "Your bookings · Rye & Co.",
            plan: "Your plan · Rye & Co.",
            messages: "Messages · Rye & Co.",
            me: "Your details · Rye & Co.",
        });
    });

    it("never names the tab Me, and never the customer", () => {
        const all = Object.values(ACCOUNT_PAGE_TITLES).join(" ");
        expect(all).not.toMatch(/\bMe\b/);
        expect(all).not.toMatch(/\bMy\b/);
    });

    it('signed out, every page is "Sign in · ‹Business›"', () => {
        for (const page of Object.values(ACCOUNT_PAGE_TITLES)) {
            expect(
                full(accountPageTitle(page, SIGNED_OUT), "Kavi Dental"),
            ).toBe("Sign in · Kavi Dental");
        }
        expect(
            full(accountPageTitle(receiptTitle("RC-0042"), SIGNED_OUT), "Kavi"),
        ).toBe("Sign in · Kavi");
    });

    it("a read that failed keeps the page's name: nobody was signed out", () => {
        for (const reason of ["unavailable", "missing"] as const) {
            expect(
                accountPageTitle(ACCOUNT_PAGE_TITLES.orders, {
                    ok: false,
                    reason,
                }),
            ).toBe("Your orders");
        }
    });

    it("a receipt and an order carry their number; unread, they are still named", () => {
        expect(full(receiptTitle("RC/26-27/0042"), "Kavi Dental")).toBe(
            "Receipt RC/26-27/0042 · Kavi Dental",
        );
        expect(receiptTitle(null)).toBe("Receipt");
        expect(receiptTitle("  ")).toBe("Receipt");
        expect(full(orderPageTitle("1019"), "Rye & Co.")).toBe(
            "Order #1019 · Rye & Co.",
        );
        expect(orderPageTitle(undefined)).toBe("Your order");
    });
});

describe("the account layout's metadata", () => {
    const meta = accountMetadata("  Rye & Co. ");

    it("gives its pages a template, and Home a whole title of its own", () => {
        expect(meta.title).toEqual({
            template: "%s · Rye & Co.",
            default: "Your account · Rye & Co.",
        });
        // The template is `titled`'s own shape, so the two never drift.
        expect(titled("Your orders", "Rye & Co.")).toBe(
            full("Your orders", "Rye & Co."),
        );
    });

    it("is never indexed", () => {
        expect(meta.robots).toEqual({ index: false, follow: false });
    });

    it("a pasted private link shows the business's name only: no home-page card, picture or description", () => {
        expect(meta.openGraph).toEqual({
            title: "Rye & Co.",
            siteName: "Rye & Co.",
            images: [],
        });
        expect(meta.twitter).toEqual({
            card: "summary",
            title: "Rye & Co.",
            images: [],
        });
        // Clears the site's own description, which the layout above set.
        expect(meta.description).toBeNull();
        const text = JSON.stringify(meta);
        expect(text).not.toMatch(/order|booking|receipt|detail/i);
    });
});
