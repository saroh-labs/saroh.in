import "server-only";

import { cache } from "react";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { dateRangeAsk } from "@/lib/views/date-range";
import { sinceParam } from "@/lib/views/since";

import { mayRead } from "./access";
import type { InvoiceDetails } from "./details";
import { readInvoiceDetails } from "./details";
import { listQueryFrom, readsOnServer } from "./list-view";
import type { InvoiceAsk, InvoicesAsk, InvoicesListView } from "./queries";
import { invoiceRead, invoicesListRead, invoicesSummaryRead } from "./queries";
import { listInvoicesIn, scopeFromQuery, scopeWithName } from "./scope";
import type { Invoice } from "./service";
import {
    getInvoice,
    listInvoices,
    listInvoicesBy,
    listInvoicesPaidSince,
    readInvoiceSummary,
} from "./service";
import type { InvoiceSummary } from "./summary";

/**
 * Who reads Invoices (DEC-259), asked by the pages' section gate and by
 * `/api/invoices/*` alike, so the two can't differ: `invoice:read`
 * (invoicing needs no module, DEC-070); anyone else a 403. What each
 * invoice shows is the API's: every read carries the person's session.
 */
export async function mayReadInvoices(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    return !!organization && mayRead(organization, "invoice:read");
}

/**
 * The list as its address asks (DEC-173, U8): the newest and every unpaid
 * one, or what only the API can answer (a search, the cheques, Paid this
 * month, an issued date), one pack's or course's, and Home's "Last 24
 * hours" paid since.
 */
export async function readInvoicesList(
    ask: InvoicesAsk,
): Promise<InvoicesListView> {
    const query = listQueryFrom(ask);
    const only = scopeFromQuery(ask);
    const paidSince = sinceParam({ since: ask.since });
    const [{ rows, truncated }, paid, scope] = await Promise.all([
        readsOnServer(query)
            ? listInvoicesBy({
                  q: query.q,
                  view: query.cheques ? "cheques" : undefined,
                  paidFrom: query.paidFrom ?? undefined,
                  ...dateRangeAsk(query),
                  ...(only?.kind === "pack" ? { packId: only.id } : {}),
                  ...(only?.kind === "course" ? { courseId: only.id } : {}),
              })
            : only
              ? listInvoicesIn(only)
              : listInvoices(),
        // Asked of the API (H-7): an old invoice paid today is past the
        // newest page `listInvoices` reads.
        paidSince ? listInvoicesPaidSince(paidSince) : null,
        only ? scopeWithName(only) : null,
    ]);
    return { invoices: rows, truncated, paid, scope };
}

/** The money strip; a strip that couldn't be read is a failed read, never zeros. */
export async function readInvoicesSummary(): Promise<InvoiceSummary> {
    const summary = await readInvoiceSummary();
    if (!summary) throw new Error("The invoice summary couldn't be read");
    return summary;
}

/** One read of an invoice per render: the tab's title and the page share it. */
export const readInvoiceOnce = cache(
    (invoiceId: string): Promise<Invoice | null> => getInvoice(invoiceId),
);

/** One invoice's details; null (a 404): missing, or another business's. */
export function readInvoiceView({
    invoiceId,
}: InvoiceAsk): Promise<InvoiceDetails | null> {
    return readInvoiceDetails(invoiceId, readInvoiceOnce);
}

export const invoicesListServer: ServerRead<InvoicesAsk, InvoicesListView> = {
    read: invoicesListRead,
    service: readInvoicesList,
};

export const invoicesSummaryServer: ServerRead<
    Parameters<typeof invoicesSummaryRead.options>[1],
    InvoiceSummary
> = { read: invoicesSummaryRead, service: readInvoicesSummary };

export const invoiceServer: ServerRead<InvoiceAsk, InvoiceDetails> = {
    read: invoiceRead,
    service: readInvoiceView,
};
