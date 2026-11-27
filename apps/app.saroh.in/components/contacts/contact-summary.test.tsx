// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContactListItem } from "@/lib/contacts/service";

import { byLastVisit, ContactSummary, owesOf } from "./contacts-view";

/** The phone's line under a contact's name (UX-051). */
function contact(over: Partial<ContactListItem> = {}): ContactListItem {
    return {
        id: "c_1",
        email: "priya@example.in",
        firstName: "Priya",
        lastName: null,
        company: null,
        phone: null,
        source: null,
        createdAt: "2026-10-07T00:00:00Z",
        openLeadValue: null,
        openLeadCount: 0,
        nextBookingAt: null,
        lastOrderAt: null,
        lastOrderTotal: null,
        lastOrderCurrency: null,
        ...over,
    } as ContactListItem;
}

describe("ContactSummary", () => {
    it("says only that there's no phone for someone with no facts — no row of bare dashes", () => {
        const html = renderToStaticMarkup(
            <ContactSummary contact={contact()} currency="INR" />,
        );
        const text = new DOMParser().parseFromString(html, "text/html").body
            .textContent;
        expect(text).toBe("No phone");
    });

    it("leads with the phone, the last visit and what they owe (DEC-277)", () => {
        const html = renderToStaticMarkup(
            <ContactSummary
                currency="INR"
                contact={contact({
                    phone: "+919876543220",
                    lastVisitAt: "2026-11-20T02:00:00Z",
                    owes: [{ currency: "INR", amount: "900.00" }],
                })}
            />,
        );
        const text = new DOMParser().parseFromString(html, "text/html").body
            .textContent;
        expect(text).toMatch(/^\+91 .*· last visit .*· Owes ₹900$/);
    });
});

describe("Contacts' order and views (DEC-277)", () => {
    it("sorts by last visit, newest first, the never-seen last", () => {
        const rows = byLastVisit([
            contact({ id: "never" }),
            contact({ id: "old", lastVisitAt: "2026-09-01T00:00:00Z" }),
            contact({ id: "new", lastVisitAt: "2026-11-20T00:00:00Z" }),
        ]);
        expect(rows.map((c) => c.id)).toEqual(["new", "old", "never"]);
    });

    it("says what someone owes, and nothing when they owe nothing", () => {
        expect(owesOf(contact())).toBeNull();
        expect(owesOf(contact({ owes: [] }))).toBeNull();
        expect(
            owesOf(contact({ owes: [{ currency: "INR", amount: "1200.00" }] })),
        ).toBe("₹1,200");
    });

    it("labels each fact it has", () => {
        const html = renderToStaticMarkup(
            <ContactSummary
                currency="INR"
                contact={contact({
                    company: "Rao & Co",
                    openLeadCount: 1,
                    lastOrderAt: "2026-10-01T00:00:00Z",
                    lastOrderTotal: "499",
                    lastOrderCurrency: "INR",
                })}
            />,
        );
        // The text a reader sees, read by the DOM rather than by stripping
        // tags with a regex.
        const text = new DOMParser().parseFromString(html, "text/html").body
            .textContent;
        expect(text).toContain("Rao & Co");
        expect(text).toContain("· 1 open lead");
        expect(text).toMatch(/· Last order .*499/);
        expect(text).not.toContain("unvalued");
        expect(text).not.toContain("—");
    });
});
