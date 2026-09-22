import { redirect } from "next/navigation";

import { searchString } from "@/lib/nav/search-string";

/**
 * Subscriptions and Plans moved under Billing (`/billing/subscriptions`,
 * `/billing/plans`). Links and bookmarks to the old paths — the command
 * menu's `?subscribe=1` among them — land on the same page.
 */
export default async function OldSubscriptionsPage({
    params,
    searchParams,
}: {
    params: Promise<{ rest?: string[] }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ rest = [] }, query] = await Promise.all([params, searchParams]);
    const to =
        rest[0] === "plans" ? "/billing/plans" : "/billing/subscriptions";
    redirect(`${to}${searchString(query)}`);
}
