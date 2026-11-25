import { readBusinessCurrency } from "@/lib/organizations/business-currency";
import { forbidden } from "next/navigation";

import { LeadsContainer } from "@/components/leads/leads-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { canOrUnknown } from "@/lib/access/require-can";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Leads index for the active organization (S3-005).
 *
 * `LeadsView` decides how to render: sorting, search, the status filters
 * and the density toggle all live in the shared `DataView`. `?view=` is
 * read here so the primitive needs no Suspense boundary — and this is the
 * destination Home's "Open leads" tile links to.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (the layout's
 * CRM `ModuleGate`, `lead:read`, what this role may do) and the currency
 * are the page's; the leads, their open follow-ups and what Add a lead
 * offers (`/api/leads`) are `LeadsContainer`'s query.
 */
export const metadata = { title: "Leads" };

export default async function LeadsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [organization, params, currency] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
        // A lead's Worth is in the business's currency (owner, 11 Oct).
        readBusinessCurrency(),
    ]);
    // A role without leads is refused, not an empty list (UX-027).
    if (!canOrUnknown(organization, "lead:read")) forbidden();
    // `lead:write` adds a lead and `activity:write` marks a follow-up done
    // (`leads.service.ts`). Someone who reads leads without them gets the
    // list as it is, with no button that would only be refused.
    const canWrite = canOrUnknown(organization, "lead:write");
    const canLog = canOrUnknown(organization, "activity:write");

    return (
        <PageContainer width="full">
            <LeadsContainer
                tab={params.tab === "follow-ups" ? "follow-ups" : "leads"}
                canWrite={canWrite}
                canLog={canLog}
                currency={currency}
                initialView={viewParam(params)}
            />
        </PageContainer>
    );
}
