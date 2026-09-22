import { PageContainer } from "@/components/shared/page-container";
import { PlansScreen } from "@/components/subscriptions/plans-screen";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listPlans } from "@/lib/subscriptions/service";

export const metadata = { title: "Plans" };

/** Billing → Subscriptions → Plans: what the business sells on repeat. */
export default async function PlansPage() {
    await requireSession();
    const [plans, organization] = await Promise.all([
        listPlans(),
        resolveActiveOrganization(),
    ]);
    const canWrite = organization?.actions
        ? organization.actions.includes("subscription:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const contacts = canWrite ? await contactPickerOptions() : [];

    return (
        <PageContainer width="full">
            <PlansScreen
                plans={plans}
                contacts={contacts}
                canWrite={canWrite}
            />
        </PageContainer>
    );
}
