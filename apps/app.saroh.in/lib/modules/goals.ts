import type { OrganizationKind } from "@/lib/organizations/kind";
import { INVOICE_JOB, kindOf } from "@/lib/organizations/kind";

/**
 * What someone starting out can do first, in one set of words (UX audit,
 * 10 Oct). Setup, Home's first run and the module picker all read this file.
 * Home used to say "Sell things / Put up a website / Keep track of people"
 * and the picker "Sell products / Show up online / Manage customers & leads"
 * for the same choice. The plainer set won.
 *
 * Each goal has one destination: the thing itself, ready to fill in, never an
 * empty list (`goalHref`).
 */
export interface Goal {
    /** A module key, or {@link INVOICE_JOB}. */
    key: string;
    verb: string;
    note: string;
    /**
     * Read after the word "Adds", so it continues rather than restarts.
     * Absent on a goal that turns nothing on, which adds no rows.
     */
    gives?: string;
}

/** The four a business starts with. The rest only mean something after one. */
export const GOALS: readonly Goal[] = [
    {
        key: "COMMERCE",
        verb: "Sell things",
        note: "Take money for products, in person or online.",
        gives: "orders, products, customers and discounts",
    },
    {
        key: "APPOINTMENTS",
        verb: "Take bookings",
        note: "A diary people can book time in.",
        gives: "a schedule and your services",
    },
    {
        key: "WEBSITE",
        verb: "Put up a website",
        note: "Pages, a journal and an address.",
        gives: "pages and posts",
    },
    {
        key: "CRM",
        verb: "Keep track of people",
        note: "Everyone you deal with, in one list.",
        gives: "contacts, leads and a pipeline",
    },
];

/**
 * "Invoice a client" (plan KTD-6): a goal with no module behind it. Invoices
 * need no module (DEC-070 Decision 5), so it opens a new invoice and adds
 * nothing to the sidebar.
 */
export const INVOICE_GOAL: Goal = {
    key: INVOICE_JOB,
    verb: "Invoice a client",
    note: "Bill for your work, send it, and mark it paid when they pay.",
};

/**
 * A goal's words for a kind, where the business's words would be wrong
 * (plan KTD-5): a freelancer keeps track of clients, and a site for someone's
 * work hears from its readers. Only the words change, never what it turns on.
 */
const WORDS_BY_KIND: Partial<
    Record<OrganizationKind, Record<string, Partial<Goal>>>
> = {
    SOLO: {
        CRM: {
            verb: "Keep track of clients",
            note: "Everyone you work for, in one list.",
        },
    },
    WORK: {
        CRM: {
            verb: "Hear from readers",
            note: "Everyone who gets in touch, in one list.",
        },
    },
};

/** A goal in a kind's words, or undefined for a key that is not a goal. */
export function goalFor(key: string, kind?: unknown): Goal | undefined {
    if (key === INVOICE_JOB) return INVOICE_GOAL;
    const goal = GOALS.find((g) => g.key === key);
    if (!goal) return undefined;
    return { ...goal, ...WORDS_BY_KIND[kindOf(kind)]?.[key] };
}

/** Setup's answer for someone who would rather look around first. */
export const GOAL_LATER = "LATER";

/** Whether `key` is something setup may be asked to start with. */
export function isGoalKey(key: string): boolean {
    return key === INVOICE_JOB || GOALS.some((g) => g.key === key);
}

/**
 * Where a goal lands once it is on: the thing itself, ready to fill in.
 * Sell opens a new product, Bookings a new service, Website the site with
 * Publish, People the contacts with New contact open. A site's address needs
 * its id; without one the Website row finds it.
 */
export function goalHref(key: string, made: { siteId?: string } = {}): string {
    switch (key) {
        case "COMMERCE":
            return "/commerce/products/new";
        case "APPOINTMENTS":
            return "/services/new";
        case "WEBSITE":
            return made.siteId ? `/sites/${made.siteId}` : "/sites";
        case "CRM":
            return "/contacts?new=1";
        case INVOICE_JOB:
            return "/billing/invoices/new";
        default:
            return "/";
    }
}
