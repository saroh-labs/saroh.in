import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { DiscountForm } from "@/components/stores/discount-form";
import { DiscountReadView } from "@/components/stores/discount-read-view";
import { canOrUnknown } from "@/lib/access/require-can";
import { loadReachOptions } from "@/lib/discounts/options";
import { getDiscount } from "@/lib/discounts/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Discount code" };

/**
 * One code, to change or end. Ending is a date and its figures are kept.
 *
 * Someone who reads discounts without `discount:write` (what the API asks
 * of the save) gets the code as text, not a form whose Save is refused.
 */
export default async function DiscountPage({
    params,
}: {
    params: Promise<{ discountId: string }>;
}) {
    await requireSession();
    const { discountId } = await params;
    const [discount, organization] = await Promise.all([
        getDiscount(discountId),
        resolveActiveOrganization(),
    ]);
    if (!discount) notFound();

    const header = (
        <PageHeader
            holdsData
            breadcrumb={["Sell", "Discount codes", discount.code]}
            title={<span className="font-mono">{discount.code}</span>}
        />
    );

    if (!canOrUnknown(organization, "discount:write")) {
        return (
            <PageContainer width="form">
                {header}
                <DiscountReadView discount={discount} />
            </PageContainer>
        );
    }

    const { options, defaultCurrency } = await loadReachOptions();
    return (
        <PageContainer width="form">
            {header}
            <DiscountForm
                discount={discount}
                options={options}
                defaultCurrency={defaultCurrency}
            />
        </PageContainer>
    );
}
