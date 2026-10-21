import { describe, expect, it } from "vitest";

import { notificationHref, targetOf } from "./href";

/** Every notice type the API writes, with what it says each opens. */
const WRITTEN: {
    type: string;
    kind: string;
    id: string | null;
    href: string;
}[] = [
    { type: "enquiry.new", kind: "lead", id: "l1", href: "/leads/l1" },
    {
        type: "review.needs-reply",
        kind: "review",
        id: "r1",
        href: "/commerce/products?tab=reviews&review=r1",
    },
    {
        type: "message.new",
        kind: "contact",
        id: "c1",
        href: "/contacts/c1?tab=msg",
    },
    {
        type: "order.new",
        kind: "order",
        id: "o1",
        href: "/commerce/orders/o1",
    },
    {
        type: "order.uncollected",
        kind: "order",
        id: "o1",
        href: "/commerce/orders/o1",
    },
    { type: "booking.new", kind: "booking", id: "b1", href: "/bookings/b1" },
    // Bookings with you (#1138), in that person's own alerts.
    {
        type: "booking.mine.new",
        kind: "booking",
        id: "b1",
        href: "/bookings/b1",
    },
    {
        type: "booking.mine.cancelled",
        kind: "booking",
        id: "b1",
        href: "/bookings/b1",
    },
    {
        type: "booking.moved",
        kind: "booking",
        id: "b1",
        href: "/bookings/b1",
    },
    {
        type: "booking.cancelled",
        kind: "booking",
        id: "b1",
        href: "/bookings/b1",
    },
    {
        type: "payment.failed",
        kind: "invoice",
        id: "i1",
        href: "/billing/invoices/i1",
    },
    { type: "site.live", kind: "site", id: "s1", href: "/sites/s1/versions" },
    {
        type: "site.not_live",
        kind: "site",
        id: "s1",
        href: "/sites/s1/pages",
    },
    {
        type: "site.review.approved",
        kind: "site",
        id: "s1",
        href: "/sites/s1/pages",
    },
    {
        type: "site.review.changes",
        kind: "site",
        id: "s1",
        href: "/sites/s1/pages",
    },
    {
        type: "site.review.note",
        kind: "site",
        id: "s1",
        href: "/sites/s1/pages",
    },
    {
        type: "domain.down",
        kind: "domain",
        id: "s1",
        href: "/sites/s1/settings",
    },
    {
        type: "domain.back",
        kind: "domain",
        id: null,
        href: "/sites",
    },
    {
        type: "provider.attention",
        kind: "providers",
        id: null,
        href: "/settings/providers",
    },
    {
        type: "provider.back",
        kind: "providers",
        id: null,
        href: "/settings/providers",
    },
    { type: "team.joined", kind: "team", id: null, href: "/settings/people" },
    // A booking rules request and its answer open Hours and time off on
    // the person (#1038); a row written before it named them, the page.
    {
        type: "hours.rule-request",
        kind: "hours",
        id: "st_1",
        href: "/bookings/availability?person=st_1",
    },
    {
        type: "hours.rule-answer",
        kind: "hours",
        id: "st_1",
        href: "/bookings/availability?person=st_1",
    },
    {
        type: "hours.rule-request",
        kind: "hours",
        id: null,
        href: "/bookings/availability",
    },
    {
        type: "plan.limit",
        kind: "plan",
        id: null,
        href: "/settings/billing/plans",
    },
    {
        type: "plan.changed",
        kind: "plan",
        id: null,
        href: "/settings/billing/plans",
    },
    {
        type: "plan.ending",
        kind: "plan",
        id: null,
        href: "/settings/billing/plans",
    },
    {
        type: "plan.move",
        kind: "plan",
        id: null,
        href: "/settings/billing/plans",
    },
    {
        type: "catalogue.merge-report",
        kind: "products",
        id: null,
        href: "/commerce/products",
    },
    // DEC-172: a customer asked to remove their data.
    {
        type: "customer.data-request",
        kind: "customer-request",
        id: "con_1",
        href: "/contacts/con_1",
    },
    {
        type: "customer.data-request",
        kind: "customer-request",
        id: null,
        href: "/commerce/customers?tab=requests",
    },
];

describe("where a notification opens", () => {
    it.each(WRITTEN)("$type opens $href", ({ type, kind, id, href }) => {
        expect(notificationHref({ type, target: { kind, id } })).toBe(href);
    });

    it("a new order and a new booking, the two that used to open nothing", () => {
        expect(
            notificationHref({
                type: "order.new",
                target: { kind: "order", id: "ord_1" },
            }),
        ).toBe("/commerce/orders/ord_1");
        expect(
            notificationHref({
                type: "booking.new",
                target: { kind: "booking", id: "bk_1" },
            }),
        ).toBe("/bookings/bk_1");
    });

    it("a row written before its record was stored opens that kind's list", () => {
        const lists: [string, string][] = [
            ["order", "/commerce/orders"],
            ["booking", "/bookings"],
            ["invoice", "/billing/invoices"],
            ["site", "/sites"],
            ["lead", "/leads"],
            ["contact", "/contacts"],
            ["review", "/commerce/products?tab=reviews"],
        ];
        for (const [kind, href] of lists) {
            expect(
                notificationHref({ type: "x.y", target: { kind, id: null } }),
            ).toBe(href);
        }
    });

    it("an API that sends no target yet is read from its older fields and its type", () => {
        expect(notificationHref({ type: "enquiry.new", leadId: "l1" })).toBe(
            "/leads/l1",
        );
        expect(
            notificationHref({ type: "review.needs-reply", reviewId: "r 1" }),
        ).toBe("/commerce/products?tab=reviews&review=r%201");
        expect(notificationHref({ type: "message.new", contactId: "c1" })).toBe(
            "/contacts/c1?tab=msg",
        );
        expect(notificationHref({ type: "order.new" })).toBe(
            "/commerce/orders",
        );
        expect(notificationHref({ type: "booking.moved" })).toBe("/bookings");
        expect(notificationHref({ type: "payment.failed" })).toBe(
            "/billing/invoices",
        );
        expect(notificationHref({ type: "plan.limit" })).toBe(
            "/settings/billing/plans",
        );
    });

    it("never answers nothing: a row nobody can place opens Home", () => {
        expect(notificationHref({ type: "something.new" })).toBe("/");
        expect(
            notificationHref({
                type: "something.new",
                target: { kind: "a kind from a newer API", id: "x" },
            }),
        ).toBe("/");
        expect(targetOf({ type: "something.new" })).toBeNull();
    });

    it("an id is never trusted into the address unescaped", () => {
        expect(
            notificationHref({
                type: "order.new",
                target: { kind: "order", id: "../settings" },
            }),
        ).toBe("/commerce/orders/..%2Fsettings");
    });
});
