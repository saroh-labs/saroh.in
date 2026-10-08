// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContactListItem } from "@/lib/contacts/service";

import { ContactSummary } from "./contacts-view";

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
    it("draws nothing for someone with no facts — no row of bare dashes", () => {
        expect(
            renderToStaticMarkup(<ContactSummary contact={contact()} />),
        ).toBe("");
    });

    it("labels each fact it has", () => {
        const html = renderToStaticMarkup(
            <ContactSummary
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
        const text =
            new DOMParser().parseFromString(html, "text/html").body
                .textContent ?? "";
        expect(text).toContain("Rao & Co");
        expect(text).toContain("· 1 open lead");
        expect(text).toMatch(/· Last order .*499/);
        expect(text).not.toContain("unvalued");
        expect(text).not.toContain("—");
    });
});
