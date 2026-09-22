import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page-container";
import { DiscountForm } from "@/components/stores/discount-form";
import { loadReachOptions } from "@/lib/discounts/options";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New discount code" };

export default async function NewDiscountPage() {
    await requireSession();
    const { options, defaultCurrency } = await loadReachOptions();
    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={["Sell", "Discounts", "New code"]}
                title="New discount code"
            />
            <DiscountForm options={options} defaultCurrency={defaultCurrency} />
        </PageContainer>
    );
}
