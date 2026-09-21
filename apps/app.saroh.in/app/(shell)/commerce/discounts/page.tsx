import { PageContainer } from "@/components/shared/page-container";
import { DiscountsScreen } from "@/components/stores/discounts-screen";
import { listDiscounts } from "@/lib/discounts/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Sell → Discounts: the business's codes. One read — a code is one row that
 * belongs to the business, not something to fan out per storefront.
 */
export const metadata = { title: "Discounts" };

export default async function DiscountsPage() {
    await requireSession();
    const [discounts, organization] = await Promise.all([
        listDiscounts(),
        resolveActiveOrganization(),
    ]);
    const canWrite = organization?.actions
        ? organization.actions.includes("discount:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="full">
            <DiscountsScreen discounts={discounts} canWrite={canWrite} />
        </PageContainer>
    );
}
