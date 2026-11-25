import { notFound } from "next/navigation";
import { cache } from "react";

import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { PlanDetailContainer } from "@/components/subscriptions/plan-detail/detail-screen";
import { permitsFor } from "@/lib/organizations/permits";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";
import { detailTabFromQuery } from "@/lib/subscriptions/plan-detail";
import { getPlan } from "@/lib/subscriptions/service";

import Loading from "./loading";

// One read for the tab's title and the page's not-found.
const readPlan = cache((planId: string) => getPlan(planId));

/** The plan's own name in the tab; "Plan" when it can't be read. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ planId: string }>;
}) {
    const { planId } = await params;
    return recordTitle(
        () => readPlan(planId),
        (plan) => plan.name,
        "Plan",
    );
}

/**
 * Payments → Plans → one plan (plan 2026-09-26-004, D4), after "Saroh Plan
 * Detail": Overview, Subscribers and History.
 *
 * Its figures show to anyone with `subscription:read` (DEC-039), so that
 * is the one gate. On React Query (DEC-259), loaded in the browser: the
 * gate is decided here, with the plan the tab's title reads anyway
 * (missing, or another business's, is this page's 404); the plan, who is
 * on it and its history are `PlanDetailContainer`'s query
 * (`/api/plans/[planId]`), read behind the route's loader. Who is on it
 * and its history each fail on their own tab.
 */
export default async function PlanPage({
    params,
    searchParams,
}: {
    params: Promise<{ planId: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    await requireSession();
    const [{ planId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);
    const may = permitsFor(organization);

    // Told so, and who can change it — not a "not found" that reads like a
    // broken link.
    if (organization?.actions && !may("subscription:read")) {
        return (
            <AccessDenied
                {...whoCanChange({
                    thing: "Plans",
                    business: organization.name,
                    role: knownRoleName(organization),
                })}
            />
        );
    }

    if (!(await readPlan(planId))) notFound();

    return (
        <PlanDetailContainer
            ask={{ planId }}
            skeleton={<Loading />}
            canWrite={may("subscription:write")}
            initialTab={detailTabFromQuery(query.tab)}
        />
    );
}
