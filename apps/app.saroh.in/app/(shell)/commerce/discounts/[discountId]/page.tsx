import { DiscountContainer } from "@/components/stores/discounts/discounts-container";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Discount code" };

/**
 * One code, to change or end. Ending is a date and its figures are kept.
 *
 * Someone who reads discounts without `discount:write` (what the API asks
 * of the save) gets the code as text, not a form whose Save is refused.
 *
 * On React Query (DEC-259), loaded in the browser: the section's gate is
 * the layout's; the code, and the form's choices only for
 * `discount:write` (`/api/discounts/[discountId]`), are
 * `DiscountContainer`'s query. Another business's code, or none, is a 404.
 */
export default async function DiscountPage({
    params,
}: {
    params: Promise<{ discountId: string }>;
}) {
    await requireSession();
    const { discountId } = await params;
    return <DiscountContainer ask={{ discountId }} />;
}
