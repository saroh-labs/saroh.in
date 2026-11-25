import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { SubscriptionsContainer } from "@/components/subscriptions/list/subscriptions-container";
import { membershipPlansLock, onlinePaymentsLock } from "@/lib/billing/access";
import { readMissingRates } from "@/lib/gst-rates/service";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { getAutopayOffer } from "@/lib/subscriptions/service";
import { screenTabFromQuery } from "@/lib/subscriptions/view";

export const metadata = { title: "Subscriptions" };

/**
 * Payments → Subscriptions (plan 2026-09-23-003, U12), with Plans as its
 * last tab (`?tab=plans`, D3).
 *
 * On React Query (DEC-259): the gate (the locked card for a role without
 * `subscription:read`, D18) and the business's facts that decide what is
 * offered (the plan's locks, autopay offered, rates missing, Appointments
 * on) are the page's; the list, the plans, each subscription's charges and
 * when renewals last ran (`/api/subscriptions`), the settings for every
 * plan (`/api/subscriptions/settings`) and who can be subscribed
 * (`/api/subscriptions/contacts`) are `SubscriptionsContainer`'s queries,
 * read in the browser into the frame drawn at once.
 *
 * `?view=` is the view someone chose in either tab's list. Without one,
 * Subscribers opens on who needs the owner when anyone does, else on the
 * active ones (`defaultView`).
 */
export default async function SubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<{
        tab?: string;
        view?: string;
        subscribe?: string;
        /** The plan Subscribe someone opens on, from a plan's page. */
        plan?: string;
    }>;
}) {
    await requireSession();
    const [organization, params] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
    ]);
    const may = permitsFor(organization);

    // Told so, and who can change it, on both tabs — rather than a read that
    // is refused halfway down the page. The design's locked card (D18).
    if (organization && !mayRead(organization, "subscription:read")) {
        return (
            <PaymentsLocked
                {...paymentsLockedCopy(organization, "subscriptions")}
            />
        );
    }

    const canWrite = may("subscription:write");
    const [modules, autopay, access, rates] = await Promise.all([
        modulesOrUnknown(),
        // Whether the copy may promise autopay (D14).
        getAutopayOffer(),
        // A plan without memberships or online payments starts no new one;
        // the ones it has keep renewing.
        billingAccessOrNull(),
        // What is on sale with no GST rate; null draws no notice.
        readMissingRates(),
    ]);
    const tab = screenTabFromQuery(params.tab ?? params.view);

    return (
        <SubscriptionsContainer
            appointments={
                modules
                    ? modules.some(
                          (m) =>
                              m.key === "APPOINTMENTS" &&
                              m.readiness !== "DISABLED",
                      )
                    : null
            }
            canWrite={canWrite}
            initialTab={tab}
            // The view someone chose: the list's on Subscribers (`?view=`,
            // or `?tab=` on an older link), the plans' on Plans.
            initialView={
                params.view ?? (tab === "plans" ? undefined : params.tab)
            }
            openSubscribe={canWrite && params.subscribe === "1"}
            subscribePlanId={params.plan}
            nowIso={new Date().toISOString()}
            autopayOffered={autopay?.offered ?? false}
            newLocked={onlinePaymentsLock(access, "subscriptions")}
            plansLocked={membershipPlansLock(access)}
            missingRates={rates}
        />
    );
}
