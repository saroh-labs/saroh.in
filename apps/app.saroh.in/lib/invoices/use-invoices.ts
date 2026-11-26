"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, createElement, useContext, useMemo } from "react";

import { homeKeys } from "@/lib/home/queries";
import { useOrgId } from "@/lib/query/org";

import type { InvoiceAsk, InvoicesAsk } from "./queries";
import {
    invoiceRead,
    invoicesKeys,
    invoicesListRead,
    invoicesSummaryRead,
} from "./queries";

/**
 * The list for the open business (DEC-259). A new search or date keeps the
 * last rows on screen (greyed by the container) until it lands.
 */
export function useInvoicesList(ask: InvoicesAsk) {
    return useQuery({
        ...invoicesListRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** The money strip and the cheques line. */
export function useInvoicesSummary() {
    return useQuery(invoicesSummaryRead.options(useOrgId(), {}));
}

/** One invoice's details; null `ask` reads nothing (the side sheet closed). */
export function useInvoice(ask: InvoiceAsk | null) {
    const orgId = useOrgId();
    return useQuery({
        ...invoiceRead.options(orgId, ask ?? { invoiceId: "" }),
        enabled: ask !== null,
    });
}

/**
 * After an invoice write landed: what Invoices has on screen (the list,
 * the strip, the invoice open) is read again, resolving once it is back so
 * a busy state lasts until the screen has changed; what isn't mounted is
 * only marked stale, and Home (owed figures, cheques) is marked stale for
 * its next visit. Never throws: a read that fails is the screen's failed
 * state.
 */
export function invoicesSaved(qc: QueryClient, orgId: string): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey: invoicesKeys(orgId) }),
        qc.invalidateQueries({
            queryKey: homeKeys(orgId),
            refetchType: "none",
        }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How an invoice part saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab and revalidating
 * nothing), and `saved()` once it landed. A refused write calls nothing.
 */
export interface InvoiceSave {
    /** The tab's business on a React Query screen; undefined elsewhere. */
    orgId: string | undefined;
    saved: () => Promise<void>;
}

const InvoiceSaveContext = createContext<InvoiceSave | null>(null);

/**
 * Invoices' own screens (the section's layout): writes go as the tab's
 * business and read Invoices' queries again.
 */
export function InvoiceSaveProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const value = useMemo<InvoiceSave>(
        () => ({ orgId, saved: () => invoicesSaved(qc, orgId) }),
        [qc, orgId],
    );
    return createElement(InvoiceSaveContext.Provider, { value }, children);
}

/**
 * Another React Query screen that draws invoice parts from its own read (a
 * customer's Invoices tab records a payment): writes go as the tab's
 * business, and `saved` is that screen's own reading again.
 */
export function InvoiceSaveFor({
    saved,
    children,
}: {
    saved: () => Promise<void>;
    children: React.ReactNode;
}) {
    const orgId = useOrgId();
    const value = useMemo<InvoiceSave>(
        () => ({ orgId, saved }),
        [orgId, saved],
    );
    return createElement(InvoiceSaveContext.Provider, { value }, children);
}

/**
 * How an invoice part saves: Invoices' (inside `InvoiceSaveProvider`), a
 * screen's own (`InvoiceSaveFor`), or as before on a screen still
 * server-rendered: no business named, the page read again.
 */
export function useInvoiceSave(): InvoiceSave {
    const router = useRouter();
    const provided = useContext(InvoiceSaveContext);
    return (
        provided ?? {
            orgId: undefined,
            saved: () => {
                // rq-refresh-ok: no caller today: every invoice part is under InvoiceSaveProvider or InvoiceSaveFor.
                router.refresh();
                return Promise.resolve();
            },
        }
    );
}
