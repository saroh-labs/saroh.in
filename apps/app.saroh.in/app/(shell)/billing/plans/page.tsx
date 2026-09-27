import { redirect } from "next/navigation";

import { searchString } from "@/lib/nav/search-string";

/**
 * Plans are a tab of Subscriptions now (D3). Links and bookmarks to the old
 * page land on the tab, with anything else they carried.
 */
export default async function PlansPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const query = await searchParams;
    redirect(
        `/billing/subscriptions${searchString({ ...query, tab: "plans" })}`,
    );
}
