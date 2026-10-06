import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { PageContainer } from "@/components/shared/page-container";
import { SubscriptionsScreen } from "@/components/subscriptions/subscriptions-screen";
import { membershipPlansLock, onlinePaymentsLock } from "@/lib/billing/access";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { plansShowClasses } from "@/lib/subscriptions/plan-cards";
import {
    getAutopayOffer,
    getRenewals,
    getSubscriptionSettings,
    listChargesBySubscription,
    listPlansOptional,
    listSubscriptions,
} from "@/lib/subscriptions/service";
import { gstNote, ranLine, screenTabFromQuery } from "@/lib/subscriptions/view";

export const metadata = { title: "Subscriptions" };

const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Payments → Subscriptions (plan 2026-09-23-003, U12), with Plans as its
 * last tab (`?tab=plans`, D3). The list is the required read. The plans,
 * when renewals last ran and each subscription's charges are optional: a
 * Plans tab that says it couldn't read them, a line left out, or a quick
 * look that says its charges could not be read — never the page.
 */
export default async function SubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; view?: string; subscribe?: string }>;
}) {
    await requireSession();
    const [organization, params] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

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
    const [{ rows: subscriptions, truncated }, planRead, modules] =
        await Promise.all([
            listSubscriptions(),
            listPlansOptional(),
            modulesOrUnknown(),
        ]);
    const [contacts, renewals, charges, settings, autopay, access] =
        await Promise.all([
            canWrite ? contactPickerOptions() : Promise.resolve([]),
            getRenewals().catch(() => null),
            listChargesBySubscription(),
            getSubscriptionSettings(),
            // Whether the copy may promise autopay (D14).
            getAutopayOffer(),
            // A plan without memberships or online payments starts no new one;
            // the ones it has keep renewing.
            billingAccessOrNull(),
        ]);
    const plans = planRead.state === "ok" ? planRead.data : null;
    const appointments = modules
        ? modules.some(
              (m) => m.key === "APPOINTMENTS" && m.readiness !== "DISABLED",
          )
        : null;

    const now = new Date();
    // Renewals run on each subscription's own zone; the line reads in the
    // zone most of them share.
    const zone = subscriptions[0]?.timezone ?? FALLBACK_ZONE;
    const ran = renewals ? ranLine(renewals, zone, now) : null;
    const gst =
        charges.state === "ok"
            ? gstNote(Object.values(charges.data).flat(), "list")
            : "";
    const renewNote = ran
        ? { text: [ran.text, gst].filter(Boolean).join(" "), late: ran.late }
        : null;

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <SubscriptionsScreen
                subscriptions={subscriptions}
                truncated={truncated}
                plans={plans}
                showClasses={plansShowClasses(appointments, plans ?? [])}
                contacts={contacts}
                charges={charges}
                renewNote={renewNote}
                canWrite={canWrite}
                initialTab={screenTabFromQuery(params.tab ?? params.view)}
                openSubscribe={canWrite && params.subscribe === "1"}
                nowIso={now.toISOString()}
                settings={settings}
                autopayOffered={autopay?.offered ?? false}
                newLocked={onlinePaymentsLock(access, "subscriptions")}
                plansLocked={membershipPlansLock(access)}
            />
        </PageContainer>
    );
}
