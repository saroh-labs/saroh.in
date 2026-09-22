import { InvoicesScreen } from "@/components/invoices/invoices-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listInvoices } from "@/lib/invoices/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Invoices" };

/** Billing → Invoices. The newest and every unpaid one; the tabs filter in the browser. */
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [{ rows: invoices, truncated }, organization, { view }] =
        await Promise.all([
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
                truncated={truncated}
                businessName={organization?.name ?? "This business"}
                canWrite={canWrite}
                initialFilterId={view}
            />
        </PageContainer>
    );
}
