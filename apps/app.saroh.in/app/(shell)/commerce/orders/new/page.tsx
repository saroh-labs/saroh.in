import { redirect } from "next/navigation";

/**
 * Sell → Orders → New order is a sheet on the Orders list (B13, the
 * design's). This address — the old page's, and the calendar's "New order"
 * — opens it there, at the storefront it named.
 */
export default async function NewOrderPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    const { storefront } = await searchParams;
    const q = new URLSearchParams({ new: "1" });
    if (storefront) q.set("storefront", storefront);
    redirect(`/commerce/orders?${q.toString()}`);
}
