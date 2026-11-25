"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useEffect } from "react";

import { EnquiriesPanel } from "@/components/contacts/enquiries-panel";
import { LeadsPanel } from "@/components/contacts/leads-panel";
import { PageLoading } from "@/components/shared/page/page-loading";
import type { Holdings } from "@/lib/contacts/removal";
import { deleteQuestion } from "@/lib/contacts/removal";
import { usePersonCrm } from "@/lib/contacts/use-contacts";
import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import type { Tab } from "@/lib/customer-workspace/view";
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
 * (`skeleton`). Their Leads and Enquiries tabs are a query of their own
 * (`/api/contacts/[contactId]`, `usePersonCrm`), which a lead added or
 * changed reads again, as is the delete question's count of their leads;
 * until it lands those tabs hold skeleton rows. The tabs the page still
 * draws on the server (Courses) come in as props.
 */
export function CustomerDetailContainer({
    ask,
    tab,
    skeleton,
    crm,
    deleteHeld,
    extra = [],
    ...screen
}: Omit<
    Screen,
    | "d"
    | "suggestions"
    | "duplicates"
    | "thread"
    | "dataRequest"
    | "initialTab"
    | "deleteWords"
> & {
    ask: CustomerAsk;
    /** `?tab=`: the tab it opens on, kept when a merged-away record leads on. */
    tab?: string;
    /** The route's loader, until the record is read. */
    skeleton: ReactNode;
    /** Leads and Enquiries (CRM on, `lead:read`); null: not shown. */
    crm: {
        person: { id: string; name: string; email: string };
        currency: string;
        knownEmail: string | null;
        first: string;
    } | null;
    /** What deleting them ends besides their leads (`heldCounts`). */
    deleteHeld: Holdings;
}) {
    const router = useRouter();
    const read = useCustomer(ask);
    const crmRead = usePersonCrm({ contactId: ask.customerId }, !!crm);
    // Null: not read yet, or it failed (the tab says which).
    const leads = crmRead.data?.leads ?? null;
    const enquiries = crmRead.data?.enquiries ?? null;
    const reading = crmRead.isPending;
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

    const rows = (label: string) => (
        <PageLoading bare width="full" shape="rows" rows={3} label={label} />
    );
    const own: (Tab & { panel: ReactNode })[] = crm
        ? [
              {
                  key: "lead",
                  label: "Leads",
                  count: leads ? leads.length : null,
                  panel: reading ? (
                      rows("Loading their leads")
                  ) : (
                      <LeadsPanel
                          person={crm.person}
                          leads={leads}
                          stages={crmRead.data?.stages ?? null}
                          currency={crm.currency}
                      />
                  ),
              },
              {
                  key: "enq",
                  label: "Enquiries",
                  count: enquiries ? enquiries.length : null,
                  panel: reading ? (
                      rows("Loading their enquiries")
                  ) : (
                      <EnquiriesPanel
                          enquiries={enquiries}
                          knownEmail={crm.knownEmail}
                          first={crm.first}
                      />
                  ),
              },
          ]
        : [];
    const tabs = [...own, ...extra];
    // The tab in the address, if this person has it (their messages are
    // the read's, for `message:read`); else the Overview.
    const initialTab = tabFromQuery(tab, [
        ...tabsFor(view.detail, view.thread, screen.reviews),
        ...tabs.map(({ key, label, count }) => ({
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
                    extra={tabs}
                    // The delete confirm names what deleting them ends; a
                    // kind not read (yet) keeps the sentence general.
                    deleteWords={deleteQuestion(leads?.length, deleteHeld)}
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
