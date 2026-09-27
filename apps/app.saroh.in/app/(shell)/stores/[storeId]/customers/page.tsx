import { redirect } from "next/navigation";

/**
 * Retired in favour of Sell (#376). Customers belong to the business now
 * (DEC-041), so a storefront's old address opens the one list filtered to
 * the people who bought there.
 */
export default async function Retired({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(`/commerce/customers?store=${encodeURIComponent(storeId)}`);
}
