import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { PlanDetail } from "@/components/subscriptions/plan-detail/detail-screen";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { plansShowClasses } from "@/lib/subscriptions/plan-cards";
import { detailTabFromQuery } from "@/lib/subscriptions/plan-detail";
import {
    getPlan,
    getSubscriptionSettings,
    listPlanEvents,
    listPlanSubscriptions,
} from "@/lib/subscriptions/service";

export const metadata = { title: "Plan" };

const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Payments → Plans → one plan (plan 2026-09-26-004, D4), after "Saroh Plan
 * Detail": Overview, Subscribers and History.
 *
 * The plan is the required read; an unknown id is the not-found state. Who
 * is on it and its history are optional: a failed read costs its own tab,
 * never the page. Its figures show to anyone with `subscription:read`
 * (DEC-039), so that is the one gate.
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
                title="You can't open this plan"
                description={`Your role in ${organization.name} can't see plans — their prices and money stay with the roles that can. An owner or admin can change that in Team.`}
            />
        );
    }

    const plan = await getPlan(planId);
    if (!plan) notFound();

    const [subscriptions, events, modules, settings] = await Promise.all([
        listPlanSubscriptions(plan.id),
        listPlanEvents(plan.id),
        modulesOrUnknown(),
        // "When autopay charges" (D13B): optional, and only where autopay
        // can charge.
        getSubscriptionSettings(),
    ]);
    const appointments = modules
        ? modules.some(
              (m) => m.key === "APPOINTMENTS" && m.readiness !== "DISABLED",
          )
        : null;
    // Dates read in the zone its subscriptions renew in.
    const timeZone =
        (subscriptions.state === "ok"
            ? subscriptions.data.rows[0]?.timezone
            : undefined) ?? FALLBACK_ZONE;

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PlanDetail
                plan={plan}
                subscriptions={subscriptions}
                events={events}
                withClasses={plansShowClasses(appointments, [plan])}
                timeZone={timeZone}
                canWrite={may("subscription:write")}
                initialTab={detailTabFromQuery(query.tab)}
                nowIso={new Date().toISOString()}
                autopay={settings?.autopay ?? null}
            />
        </PageContainer>
    );
}
