"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useEffect } from "react";

import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import { tabFromQuery, tabsFor } from "@/lib/customer-workspace/view";
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
 * too (`InvoiceSaveFor`). Read in the browser, behind the route's loader
 * (`skeleton`). The tabs the page draws on the server (Leads, Enquiries,
 * Courses) come in as props.
 */
export function CustomerDetailContainer({
    ask,
    tab,
    skeleton,
    ...screen
}: Omit<
    Screen,
    "d" | "suggestions" | "duplicates" | "thread" | "dataRequest" | "initialTab"
> & {
    ask: CustomerAsk;
    /** `?tab=`: the tab it opens on, kept when a merged-away record leads on. */
    tab?: string;
    /** The route's loader, until the record is read. */
    skeleton: ReactNode;
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
    if (!view || isMergedRedirect(view.detail)) return skeleton;
    // The tab in the address, if this person has it (their messages are
    // the read's, for `message:read`); else the Overview.
    const initialTab = tabFromQuery(tab, [
        ...tabsFor(view.detail, view.thread, screen.reviews),
        ...(screen.extra ?? []).map(({ key, label, count }) => ({
            key,
            label,
            count,
        })),
    ]);

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <InvoiceSaveFor saved={saved}>
                <CustomerDetailScreen
                    {...screen}
                    initialTab={initialTab}
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
        </PageContainer>
    );
}
