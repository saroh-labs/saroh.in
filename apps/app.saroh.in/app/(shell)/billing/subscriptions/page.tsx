import { PageContainer } from "@/components/shared/page-container";
import { SubscriptionsScreen } from "@/components/subscriptions/subscriptions-screen";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import {
    getRenewals,
    listChargesBySubscription,
    listPlans,
    listSubscriptions,
} from "@/lib/subscriptions/service";
import { gstNote, ranLine, tabFromQuery } from "@/lib/subscriptions/view";

export const metadata = { title: "Subscriptions" };

const FALLBACK_ZONE = "Asia/Kolkata";

/**
 * Payments → Subscriptions (plan 2026-09-23-003, U12). The list and the
 * plans are required reads. When renewals last ran and each subscription's
 * charges are optional: a line left out, or a quick look that says its
 * charges could not be read — never the page.
 */
export default async function SubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; view?: string; subscribe?: string }>;
}) {
    await requireSession();
    const [{ rows: subscriptions, truncated }, plans, organization, params] =
        await Promise.all([
            listSubscriptions(),
            listPlans(),
            resolveActiveOrganization(),
            searchParams,
        ]);
    const canWrite = organization?.actions
        ? organization.actions.includes("subscription:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const [contacts, renewals, charges] = await Promise.all([
        canWrite ? contactPickerOptions() : Promise.resolve([]),
        getRenewals().catch(() => null),
        listChargesBySubscription(),
    ]);

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
                contacts={contacts}
                charges={charges}
                renewNote={renewNote}
                canWrite={canWrite}
                initialTab={tabFromQuery(params.tab ?? params.view)}
                openSubscribe={canWrite && params.subscribe === "1"}
                nowIso={now.toISOString()}
            />
        </PageContainer>
    );
}
