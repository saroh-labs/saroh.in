import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { SearchParams } from "@/lib/views/search-params";

import type { InvoiceDetails } from "./details";
import { listQueryFrom } from "./list-view";
import type { Invoice } from "./service";
import type { InvoiceScope } from "./sources";
import type { InvoiceSummary } from "./summary";

/**
 * Invoices' reads (DEC-259): the list, the money strip and one invoice.
 * Client-safe: the keys and the routes; the services are paired in
 * `access-server.ts`.
 */

/** Every Invoices read of a business. */
export const invoicesKeys = (orgId: string): DomainKey =>
    domainKey("invoices", orgId);

// A word the address may carry; the server decides what each means
// (`listQueryFrom`, `scopeFromQuery`, `sinceParam`), as the page always has.
const word = z.string().max(100).optional();

/**
 * What the list asks the API, from its address. Only what changes the
 * read: the status, Owed and the source are the browser's filters over the
 * same rows, so picking one reads nothing.
 */
export const invoicesListRead = defineRead<InvoicesListView>()({
    key: (orgId, ask) => domainKey("invoices", orgId, "list", ask),
    route: {
        path: "/api/invoices",
        params: {
            q: word,
            view: z.literal("cheques").optional(),
            paidFrom: word,
            date: word,
            from: word,
            to: word,
            pack: word,
            course: word,
            since: word,
        },
    },
});

export type InvoicesAsk = Parameters<typeof invoicesListRead.options>[1];

/** The list as its page draws it. */
export interface InvoicesListView {
    invoices: Invoice[];
    /** The newest read hit its cap: older paid and void ones are not here. */
    truncated: boolean;
    /** `?since=`: the API's read of the invoices paid since; null when unread. */
    paid: Invoice[] | null;
    /** `?pack=` or `?course=`: whose invoices these are, with its name. */
    scope: InvoiceScope | null;
}

/**
 * The list's read, from the address as the screen reads it: two ways of
 * writing one read (`?view=overdue` and `?tab=paid`) share a key.
 */
export function invoicesAsk(params: SearchParams): InvoicesAsk {
    const query = listQueryFrom(params);
    // "" for none, which sets nothing below.
    const one = (k: string): string => {
        const v = params[k];
        return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
    };
    // Only the keys that say something: the key and the address agree.
    const ask: InvoicesAsk = {};
    if (query.q) ask.q = query.q;
    if (query.cheques) ask.view = "cheques";
    if (query.paidFrom) ask.paidFrom = query.paidFrom;
    if (query.date) ask.date = query.date;
    if (query.from) ask.from = query.from;
    if (query.to) ask.to = query.to;
    const pack = one("pack");
    const course = one("course");
    if (pack) ask.pack = pack;
    else if (course) ask.course = course;
    const since = one("since");
    if (since) ask.since = since;
    return ask;
}

/**
 * The money strip (Owed, Overdue, Paid this month, Drafts) and the cheques
 * line: its own read, so a payment reads it again beside the list.
 */
export const invoicesSummaryRead = defineRead<InvoiceSummary>()({
    key: (orgId) => domainKey("invoices", orgId, "summary"),
    route: { path: "/api/invoices/summary", params: {} },
});

const ID = z.string().regex(/^[\w-]{1,64}$/);

/** One invoice's details: its page and the list's side sheet read the same. */
export const invoiceRead = defineRead<InvoiceDetails>()({
    key: (orgId, { invoiceId }) =>
        domainKey("invoices", orgId, "invoice", invoiceId),
    route: { path: "/api/invoices/[invoiceId]", params: { invoiceId: ID } },
});

export type InvoiceAsk = Parameters<typeof invoiceRead.options>[1];
