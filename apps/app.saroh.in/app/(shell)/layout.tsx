import { ROWS_COOKIE, readRowsCookie } from "@saroh/ui/lib/paging";
import { PageSizes } from "@saroh/ui/page-sizes";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppShell } from "@/components/shared/app-shell";
import { activeBusinessTitle } from "@/lib/organizations/tab-title";

/**
 * The tab says whose page it is: "Orders · Rye & Co. · Saroh". A page
 * writes only "Orders"; the business comes from the read the shell already
 * makes (`activeOrganizationOnce`), so it costs no call to the API.
 */
export function generateMetadata(): Promise<Metadata> {
    return activeBusinessTitle();
}

/**
 * Every route that belongs inside the working app. The `(shell)` group exists
 * only to scope `AppShell` — it does not appear in any URL — so first-run
 * routes outside it can render their own, quieter chrome.
 */
export default async function ShellLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Each list's rows per page, as this browser last chose (DEC-134):
    // read here so a list draws the right number the first time.
    const rows = readRowsCookie((await cookies()).get(ROWS_COOKIE)?.value);
    return (
        <PageSizes initial={rows}>
            <AppShell>{children}</AppShell>
        </PageSizes>
    );
}
