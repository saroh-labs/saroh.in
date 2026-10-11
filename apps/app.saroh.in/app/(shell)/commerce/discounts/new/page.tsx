import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page-container";
import { DiscountForm } from "@/components/stores/discount-form";
import { requireCan } from "@/lib/access/require-can";
import { loadReachOptions } from "@/lib/discounts/options";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New discount code" };

export default async function NewDiscountPage() {
    await requireSession();
    // Asked before the form is drawn: `discount:write` is what the API asks of
    // the save (`requireCan`).
    const access = await requireCan("discount:write", {
        thing: "New discount code",
        back: {
            href: "/commerce/discounts",
            label: "Back to Discounts",
            needs: "discount:read",
        },
    });
    if (access.denied) return access.denied;
    const { options, defaultCurrency } = await loadReachOptions();
    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={["Sell", "Discount codes", "New code"]}
                title="New discount code"
            />
            <DiscountForm options={options} defaultCurrency={defaultCurrency} />
        </PageContainer>
    );
}
