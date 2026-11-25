"use client";

import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { DiscountForm } from "@/components/stores/discounts/discount-form";
import { DiscountReadView } from "@/components/stores/discounts/discount-read-view";
import { DiscountsScreen } from "@/components/stores/discounts/discounts-screen";
import type { DiscountAsk } from "@/lib/discounts/queries";
import { useDiscount, useDiscounts } from "@/lib/discounts/use-discounts";
import { ReadFailed } from "@/lib/query/client";

/**
 * Discount codes on React Query (DEC-259), read in the browser: the same
 * screens, from one query each (`/api/discounts`,
 * `/api/discounts/[discountId]`) that a code's save marks stale
 * (`useDiscountsSave`). A failed read is the page failing (`error.tsx`),
 * never an empty list.
 */
export function DiscountsContainer({ canWrite }: { canWrite: boolean }) {
    const read = useDiscounts();
    if (read.isError && !read.data) throw read.error;
    return <DiscountsScreen discounts={read.data} canWrite={canWrite} />;
}

/**
 * One code: the form for whoever may change it (`discount:write`: the read
 * carries the form's choices), its text for the rest. Its title is the
 * code, so the route's loader stands until it lands. No such code here is
 * the page's 404. The form keeps its draft: the read only starts it.
 */
export function DiscountContainer({ ask }: { ask: DiscountAsk }) {
    const read = useDiscount(ask);
    if (read.isError && !read.data) {
        const status =
            read.error instanceof ReadFailed ? read.error.status : null;
        if (status === 404 || status === 400) notFound();
        throw read.error;
    }
    if (!read.data) {
        return (
            <PageLoading
                shape="form"
                width="form"
                breadcrumb={["Sell", "Discount codes"]}
                label="Loading the code"
            />
        );
    }
    const { discount, reach } = read.data;
    return (
        <PageContainer width="form">
            <PageHeader
                holdsData
                breadcrumb={["Sell", "Discount codes", discount.code]}
                title={<span className="font-mono">{discount.code}</span>}
            />
            {reach ? (
                <DiscountForm
                    discount={discount}
                    options={reach.options}
                    defaultCurrency={reach.defaultCurrency}
                />
            ) : (
                <DiscountReadView discount={discount} />
            )}
        </PageContainer>
    );
}
