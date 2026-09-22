import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listInvoices } from "@/lib/invoices/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Invoices" };

/** Billing → Invoices. One read; the tabs filter it in the browser. */
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [invoices, organization, { view }] = await Promise.all([
        listInvoices(),
        resolveActiveOrganization(),
        searchParams,
    ]);
    const canWrite = organization?.actions
        ? organization.actions.includes("invoice:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="full">
            <InvoicesScreen
                invoices={invoices}
                businessName={organization?.name ?? "This business"}
                canWrite={canWrite}
                initialFilterId={view}
            />
        </PageContainer>
    );
}
