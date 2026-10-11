import { redirect } from "next/navigation";

import { storefrontPeopleHref } from "@/lib/stores/links";

/**
 * A location's people are a tab of its own page now (`?section=people`);
 * this address, and every old link to it, still lands there.
 */
export default async function StorefrontPeoplePage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(storefrontPeopleHref(storeId));
}
