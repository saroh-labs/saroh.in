import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { DiscountForm } from "@/components/stores/discount-form";
import { loadReachOptions } from "@/lib/discounts/options";
import { getDiscount } from "@/lib/discounts/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Discount code" };

/** One code, to change or end. Ending is a date; its figures are kept. */
export default async function DiscountPage({
    params,
}: {
    params: Promise<{ discountId: string }>;
}) {
    await requireSession();
    const { discountId } = await params;
    const [discount, { options, defaultCurrency }] = await Promise.all([
        getDiscount(discountId),
        loadReachOptions(),
    ]);
    if (!discount) notFound();

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={["Sell", "Discounts", discount.code]}
                title={<span className="font-mono">{discount.code}</span>}
            />
            <DiscountForm
                discount={discount}
                options={options}
                defaultCurrency={defaultCurrency}
            />
        </PageContainer>
    );
}
