import { notFound, redirect } from "next/navigation";

import { CustomerDetailScreen } from "@/components/customers/detail/detail-screen";
import type { PackSale } from "@/components/customers/detail/packs-tab";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { canSellPacks, canWritePacks } from "@/lib/class-packs/access";
import { loadContactHoldings } from "@/lib/contacts/holdings";
import { sellPacksOnly } from "@/lib/contacts/panels";
import { rolesThatSeeSensitive } from "@/lib/customer-workspace/attention";
import { getCustomerDetail } from "@/lib/customer-workspace/detail";
import {
    isMergedRedirect,
    mergedRedirectPath,
} from "@/lib/customer-workspace/merge";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import { getSuggestions, getThread } from "@/lib/customer-workspace/service";
import type { ReviewsRead, ThreadRead } from "@/lib/customer-workspace/view";
import { tabFromQuery, tabsFor } from "@/lib/customer-workspace/view";
import { listRoles } from "@/lib/organizations/roles";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { contactReviews } from "@/lib/product-reviews/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Customer" };

/**
 * Customer Detail (plan 2026-09-23-003, U18, after "Saroh Customer Detail").
 *
 * Rooted on the contact — the record every business kind has — and rendered
 * from one read (U8): orders come only from store customers someone linked,
 * a same-email store customer is offered as a possible match and nothing
 * more, and a source that fails is named while the rest renders. What a role
 * may not read is not in the read, so a Member sees no billing tabs and no
 * money. `?tab=` opens a tab.
 */
export default async function CustomerDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ contactId: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await requireSession();
    const [{ contactId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    // Told so, and who can change it — not a "not found" that reads like a
    // broken link.
    if (organization?.actions && !may("contact:read")) {
        return (
            <AccessDenied
                title="You can't open customers"
                description={`Your role in ${organization.name} can't see customers. An owner or admin can change that in Team.`}
            />
        );
    }

    const detail = await getCustomerDetail(contactId);
    if (!detail) notFound();
    // A record merged into another (C9): its old address leads to the one
    // kept, on the same tab.
    if (isMergedRedirect(detail)) {
        redirect(mergedRedirectPath(detail.mergedInto, query.tab));
    }

    const canWrite = may("contact:write");
    const canMerge = may("customer:merge");
    const canRemove = may("customer:remove");
    // Only whoever may link or merge reads what they'd be offered: store
    // customers to link, and other records that look like the same person.
    const suggestions =
        canWrite || canMerge
            ? await getSuggestions(contactId, { includeContacts: true }).catch(
                  () => [],
              )
            : [];
    // Their message thread (A13), for whoever may read messages. A failed
    // read shows the tab with the failure said, never an empty thread.
    const thread: ThreadRead = may("message:read")
        ? await getThread(contactId).catch((): ThreadRead => "failed")
        : null;
    // Their product reviews (C6), where the business sells and for whoever
    // may read reviews; a failed read shows the tab with the failure said.
    const reviews: ReviewsRead =
        detail.linkedCustomers !== undefined && may("product-review:read")
            ? await contactReviews(contactId).catch((): ReviewsRead => "failed")
            : null;
    // Their packs are in the read only where Class packs is on and the
    // viewer reads them (C7). Selling one needs the packs on sale; a list
    // that can't be read offers no Sell rather than an empty dialog.
    const packsShown = detail.packs !== undefined;
    const packSale: PackSale | null =
        packsShown && canSellPacks(organization)
            ? await loadContactHoldings(contactId, sellPacksOnly()).then(
                  ({ choices }) =>
                      choices.packs
                          ? {
                                packs: choices.packs,
                                invoicesOnSale: choices.invoicesOnSale,
                            }
                          : null,
              )
            : null;
    const tabs = tabsFor(detail, thread, reviews);
    const canSensitive =
        may("customer:sensitive") ||
        organization?.role === "OWNER" ||
        organization?.role === "ADMIN";
    // C12's sensitive tick names who can read the note (DEC-073): read only
    // when there is a note to tick. A failed read drops the names, not the
    // tick.
    const sensitiveRoles =
        canWrite && canSensitive && detail.attention?.suggestions?.length
            ? await listRoles()
                  .then(rolesThatSeeSensitive)
                  .catch(() => null)
            : null;

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <CustomerDetailScreen
                d={detail}
                initialTab={tabFromQuery(query.tab, tabs)}
                bizName={organization?.name ?? null}
                // Linked store customers are read only where the business
                // sells, so their presence says it does. Sell › Customers
                // follows contact:read alone (B16, matrix W-1), a Member's
                // included, so the crumb says what their rail does.
                sells={detail.linkedCustomers !== undefined}
                canWrite={canWrite}
                canMerge={canMerge}
                canRemove={canRemove}
                canConsent={may("consent:write")}
                // Owner and Admin hold it, including on an API from before
                // C13, whose list doesn't name it yet.
                canSensitive={canSensitive}
                sensitiveRoles={sensitiveRoles}
                userId={session.user.id}
                suggestions={suggestions.filter(
                    (s): s is IdentitySuggestion => s.kind === "customer",
                )}
                duplicates={suggestions.filter(
                    (s): s is DuplicateSuggestion => s.kind === "contact",
                )}
                thread={thread}
                reviews={reviews}
                canReplyReviews={may("product-review:write")}
                packSale={packSale}
                canExtendPacks={packsShown && canWritePacks(organization)}
                nowIso={new Date().toISOString()}
            />
        </PageContainer>
    );
}
