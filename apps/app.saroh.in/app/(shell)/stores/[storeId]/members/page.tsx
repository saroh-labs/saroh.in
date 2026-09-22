import { redirect } from "next/navigation";

import { storefrontPeopleHref } from "@/lib/stores/links";

/** Retired in favour of Sell (#376); this address still works. */
export default async function Retired({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(storefrontPeopleHref(storeId));
}
