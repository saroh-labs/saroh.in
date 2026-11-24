"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useEffect } from "react";

import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import type { CustomerAsk } from "@/lib/customers/queries";
import { useCustomer, useCustomerSave } from "@/lib/customers/use-customers";
import { InvoiceSaveFor } from "@/lib/invoices/use-invoices";

import { CustomerDetailScreen } from "./detail-screen";

type Screen = ComponentProps<typeof CustomerDetailScreen>;

/**
 * A customer's page on React Query (DEC-259): the same
 * `CustomerDetailScreen`, its record, messages, link and merge offers and
 * open removal request one query, which a note, a reply, an edit or a merge
 * reads again (`useCustomerSave`); a payment recorded on their Invoices tab
 * too (`InvoiceSaveFor`). The tabs the page draws on the server (Leads,
 * Enquiries, Courses) come in as props.
 */
export function CustomerDetailContainer({
    ask,
    tab,
    ...screen
}: Omit<
    Screen,
    "d" | "suggestions" | "duplicates" | "thread" | "dataRequest"
> & {
    ask: CustomerAsk;
    /** `?tab=`, kept when a merged-away record leads to the one kept. */
    tab?: string;
}) {
    const router = useRouter();
    const read = useCustomer(ask);
    const { saved } = useCustomerSave();
    const view = read.data;
    const merged =
        view && isMergedRedirect(view.detail) ? view.detail.mergedInto : null;

    // Merged into another while open (C9): their page is the one kept.
    useEffect(() => {
        if (merged) router.replace(mergedRedirectPath(merged, tab));
    }, [merged, tab, router]);

    // A failed read is the page failing (`error.tsx`).
    if (read.isError && !view) throw read.error;
    if (!view || isMergedRedirect(view.detail)) return null;

    return (
        <InvoiceSaveFor saved={saved}>
            <CustomerDetailScreen
                {...screen}
                d={view.detail}
                suggestions={view.suggestions.filter(
                    (s): s is IdentitySuggestion => s.kind === "customer",
                )}
                duplicates={view.suggestions.filter(
                    (s): s is DuplicateSuggestion => s.kind === "contact",
                )}
                thread={view.thread}
                dataRequest={view.dataRequest}
            />
        </InvoiceSaveFor>
    );
}
