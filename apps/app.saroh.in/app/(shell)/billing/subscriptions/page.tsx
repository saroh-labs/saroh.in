import { PageContainer } from "@/components/shared/page-container";
import { SubscriptionsScreen } from "@/components/subscriptions/subscriptions-screen";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import {
    getRenewals,
    listPlans,
    listSubscriptions,
} from "@/lib/subscriptions/service";

export const metadata = { title: "Subscriptions" };

/**
 * Billing → Subscriptions. The list and the plans are required reads; when
 * renewals were last checked is optional, and its line is left out if it
 * cannot be read rather than failing the page.
 */
export default async function SubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string; subscribe?: string }>;
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
    const [contacts, renewals] = await Promise.all([
        canWrite ? contactPickerOptions() : Promise.resolve([]),
        getRenewals().catch(() => null),
    ]);

    return (
        <PageContainer width="full">
            <SubscriptionsScreen
                subscriptions={subscriptions}
                truncated={truncated}
                plans={plans}
                contacts={contacts}
                renewals={renewals}
                canWrite={canWrite}
                initialFilterId={params.view}
                openSubscribe={canWrite && params.subscribe === "1"}
            />
        </PageContainer>
    );
}
