import { PageContainer } from "@/components/shared/page/page-container";
import { DiscountsContainer } from "@/components/stores/discounts/discounts-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Sell → Discounts: the business's codes. One read — a code is one row that
 * belongs to the business, not something to fan out per storefront.
 *
 * On React Query (DEC-259), loaded in the browser: the page decides who may
 * make a code (New code) and draws the screen's frame at once; the codes
 * (`/api/discounts`) are `DiscountsContainer`'s query.
 */
export const metadata = { title: "Discount codes" };

export default async function DiscountsPage() {
    await requireSession();
    const organization = await resolveActiveOrganization();
    const canWrite = organization?.actions
        ? organization.actions.includes("discount:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="full">
            <DiscountsContainer canWrite={canWrite} />
        </PageContainer>
    );
}
