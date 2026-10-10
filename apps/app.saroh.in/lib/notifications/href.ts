import { personHref } from "@/lib/contacts/person-href";

/**
 * Where a notification opens (10 Oct 2026). Every row in the inbox is a
 * link: to the order, booking, invoice, lead, review, customer or website
 * it is about, or to the page for one that is about a place (the team, the
 * plan, the providers).
 *
 * The API says what each row opens (`target`: a kind, and the record's
 * id); this is the one place the app turns that into an address, so the
 * routes stay the app's own. A row written before its target was stored
 * has a kind and no id, and opens that kind's list. A row from an API that
 * sends no target yet is read from its older fields. Nothing answers
 * null: a row with nowhere to go opens Home.
 *
 * Pure and client-safe.
 */

export type NoticeKind =
    | "lead"
    | "review"
    | "contact"
    | "order"
    | "booking"
    | "invoice"
    | "site"
    | "domain"
    | "providers"
    | "team"
    | "plan"
    | "products";

export interface NoticeTarget {
    kind: NoticeKind;
    id: string | null;
}

/** What `notificationHref` reads of a notification. */
export interface Opens {
    type: string;
    target?: { kind: string; id: string | null } | null;
    leadId?: string | null;
    reviewId?: string | null;
    contactId?: string | null;
}

const REVIEWS = "/commerce/products?tab=reviews";

/** Each kind's address: the record's, or its list when the id isn't known. */
const HREF: Record<NoticeKind, (id: string | null, type: string) => string> = {
    lead: (id) => (id ? `/leads/${encodeURIComponent(id)}` : "/leads"),
    review: (id) =>
        id ? `${REVIEWS}&review=${encodeURIComponent(id)}` : REVIEWS,
    // A customer's message: their thread.
    contact: (id) => (id ? personHref(id, "msg") : "/contacts"),
    order: (id) =>
        id ? `/commerce/orders/${encodeURIComponent(id)}` : "/commerce/orders",
    booking: (id) => (id ? `/bookings/${encodeURIComponent(id)}` : "/bookings"),
    invoice: (id) =>
        id
            ? `/billing/invoices/${encodeURIComponent(id)}`
            : "/billing/invoices",
    // A go-live that ran opens what is live; anything else, the pages.
    site: (id, type) =>
        id
            ? `/sites/${encodeURIComponent(id)}/${type === "site.live" ? "versions" : "pages"}`
            : "/sites",
    // Your own domain is in the site's settings.
    domain: (id) =>
        id ? `/sites/${encodeURIComponent(id)}/settings` : "/sites",
    providers: () => "/settings/providers",
    team: () => "/settings/people",
    plan: () => "/settings/billing#change-plan",
    products: () => "/commerce/products",
};

function isKind(kind: string): kind is NoticeKind {
    return Object.prototype.hasOwnProperty.call(HREF, kind);
}

/** A row from an API that sends no target yet: its type's first word. */
const KIND_OF_PREFIX: Partial<Record<string, NoticeKind>> = {
    order: "order",
    booking: "booking",
    payment: "invoice",
    site: "site",
    domain: "domain",
    provider: "providers",
    team: "team",
    plan: "plan",
    catalogue: "products",
};

/** The kind and record a notification opens, however the API said it. */
export function targetOf(n: Opens): NoticeTarget | null {
    if (n.target && isKind(n.target.kind)) {
        return { kind: n.target.kind, id: n.target.id };
    }
    if (n.leadId) return { kind: "lead", id: n.leadId };
    if (n.reviewId) return { kind: "review", id: n.reviewId };
    if (n.contactId) return { kind: "contact", id: n.contactId };
    const kind = KIND_OF_PREFIX[n.type.split(".")[0] ?? ""];
    return kind ? { kind, id: null } : null;
}

/** Where the row goes. Always somewhere. */
export function notificationHref(n: Opens): string {
    const target = targetOf(n);
    return target ? HREF[target.kind](target.id, n.type) : "/";
}
