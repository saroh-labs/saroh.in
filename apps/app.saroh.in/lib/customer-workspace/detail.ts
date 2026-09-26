import { apiFetch, getJson, orgBase } from "@/lib/api/http";
import type { InvoiceSource, InvoiceStanding } from "@/lib/invoices/service";
import type { Interval } from "@/lib/subscriptions/service";

/**
 * One read of a customer (U8, R17), as Customer Detail (U18) receives it —
 * `GET organizations/:org/customers/:contactId/detail`. Server-only.
 *
 * Rooted on the contact. A block the viewer may not read, or whose module is
 * off, is ABSENT; one the API could not read is `null` and named in
 * `unavailable`. Money figures are left out for a role that reads no money
 * (`money: false`), never sent for the screen to hide.
 */

export interface MoneyTotal {
    currency: string;
    amount: string;
}

export interface Storefront {
    id: string;
    name: string;
}

export interface DetailNote {
    id: string;
    body: string;
    /** As written: one chip per name. */
    allergens: { id: string; name: string }[];
    /** Every storefront's allergen of those names; Order Detail checks these. */
    matchAllergens: { id: string; name: string }[];
    createdByUserId: string | null;
    author: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface DetailOrder {
    id: string;
    number: string;
    placedAt: string;
    status: string;
    paymentStatus: string;
    itemCount: number;
    items: {
        productId: string;
        name: string;
        variant: string | null;
        quantity: number;
    }[];
    fulfilment: string;
    stage: string;
    delivery: string | null;
    total?: string;
    currency?: string;
    via: { customerId: string; storefront: Storefront };
}

export type PaidWith = "MEMBERSHIP" | "PACK" | "PAID" | "DESK";

export interface DetailBooking {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    service: { id: string; name: string };
    isClass: boolean;
    staff: { id: string; name: string } | null;
    status: string;
    outcome: string | null;
    paidWithPack: boolean;
    paidWith: PaidWith | null;
    packName: string | null;
    cancelledLate: boolean;
}

export interface DetailSubscription {
    id: string;
    plan: { id: string; name: string };
    status: string;
    interval: Interval;
    price: string;
    currency: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextChargeAt: string | null;
    cancelAtPeriodEnd: boolean;
    pausedAt: string | null;
    cancelledAt: string | null;
}

export interface DetailInvoice {
    id: string;
    number: string | null;
    status: string;
    standing: InvoiceStanding;
    source: InvoiceSource;
    kind: string;
    orderId: string | null;
    orderNumber: string | null;
    planName: string | null;
    total: string;
    currency: string;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
}

export interface DetailPack {
    id: string;
    pack: { id: string; name: string };
    credits: number;
    used: number;
    left: number;
    expiresAt: string;
    boughtAt: string;
    standing: "ACTIVE" | "USED_UP" | "EXPIRED";
    price?: string;
    currency?: string;
}

export interface MembershipAllowance {
    subscriptionId: string;
    plan: string;
    perMonth: number;
    used: number;
    left: number;
    resetsAt: string;
    paused: boolean;
}

export interface DetailStats {
    orders?: number | null;
    bookings?: number | null;
    attended?: number | null;
    noShows?: number | null;
    lateCancels?: number | null;
    classesLeft?: {
        total: number;
        packs: number;
        membership: number | null;
        nextExpiry: string | null;
        allowance: MembershipAllowance | null;
    } | null;
    spent?: MoneyTotal[] | null;
    owed?: {
        totals: MoneyTotal[];
        unpaidCount: number;
        overdueCount: number;
    } | null;
}

export interface CustomerDetail {
    contact: {
        id: string;
        name: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        phone: string | null;
        company: string | null;
        source: string | null;
        createdAt: string;
    };
    money: boolean;
    /** The business's zone, for the dates the screen writes out. */
    timezone: string;
    stats: DetailStats;
    notes: {
        from: "contact";
        rows: DetailNote[];
        allergenChoices: { id: string; name: string }[];
    } | null;
    allergens: { id: string; name: string }[] | null;
    linkedCustomers?:
        | {
              linkId: string;
              customerId: string;
              name: string;
              email: string;
              storefront: Storefront;
              linkedAt: string;
          }[]
        | null;
    possibleMatches?:
        { customerId: string; name: string; storefront: Storefront }[] | null;
    orders?: { from: "linked-customers"; rows: DetailOrder[] } | null;
    bookings?: {
        from: "contact";
        upcoming: DetailBooking[];
        past: DetailBooking[];
    } | null;
    subscriptions?: { from: "contact"; rows: DetailSubscription[] } | null;
    invoices?: { from: "contact"; rows: DetailInvoice[] } | null;
    packs?: { from: "contact"; rows: DetailPack[] } | null;
    consent: {
        status: string | null;
        source: string | null;
        at: string | null;
    } | null;
    unavailable: { source: string; label: string }[];
}

/**
 * The customer, or null when there is no such contact in this business. A
 * 403 renders the forbidden boundary and any other failure throws to the
 * route's error boundary — a failed read is never an empty customer.
 */
export async function getCustomerDetail(
    contactId: string,
): Promise<CustomerDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<CustomerDetail>(
        `${base}/customers/${encodeURIComponent(contactId)}/detail`,
    );
}

/**
 * The contact a store customer is linked to, or null — unlinked, or the
 * lookup failed (the store customer's own page then stands).
 */
export async function contactForCustomer(
    customerId: string,
): Promise<string | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(
            `${base}/customers/links/by-customer/${encodeURIComponent(customerId)}`,
        );
        if (!res.ok) return null;
        return ((await res.json()) as { contactId: string | null }).contactId;
    } catch {
        return null;
    }
}
