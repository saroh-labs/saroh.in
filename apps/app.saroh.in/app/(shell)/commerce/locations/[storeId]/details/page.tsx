import { redirect } from "next/navigation";

import { storefrontDetailsHref } from "@/lib/stores/links";

/**
 * A location's description and logo are a row of The place now, edited in
 * its sheet (`?edit=details`); this address, and every old link to it,
 * still lands there with the sheet open. Its name has its own row.
 */
export default async function StorefrontDetailsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(storefrontDetailsHref(storeId));
}
