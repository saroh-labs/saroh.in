import { redirect } from "next/navigation";

import { searchString } from "@/lib/nav/search-string";

/**
 * Invoices moved under Billing (`/billing/invoices`), beside Subscriptions
 * and Plans. Links and bookmarks to the old path land on the same page.
 */
export default async function OldInvoicesPage({
    params,
    searchParams,
}: {
    params: Promise<{ rest?: string[] }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ rest = [] }, query] = await Promise.all([params, searchParams]);
    const tail = rest.map(encodeURIComponent).join("/");
    redirect(
        `/billing/invoices${tail ? `/${tail}` : ""}${searchString(query)}`,
    );
}
