import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { ArrowUpRight } from "lucide-react";
import { headers } from "next/headers";

import { AdminShell } from "@/components/admin-shell";
import { requireStaff } from "@/lib/console";
import { SAROH_APPS, sarohAppUrl } from "@/lib/saroh-apps";

export const metadata = { title: "Saroh's apps" };

/**
 * A launcher for Saroh's own hosts (DEC-199). It was accounts.saroh.in's
 * /apps, a centred card for staff only; it lives in the console now, where
 * only staff are, and accounts' old address redirects here. Any staff
 * member may open it, as before: it holds links, nothing to act on.
 */
export default async function AppsPage() {
    const gate = await requireStaff();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const host = (await headers()).get("host");

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Keep it running", "Saroh's apps"]}
                    title="Saroh's apps"
                    description="Every host this instance runs, in this environment."
                />
                <ul className="grid divide-y divide-border rounded-xl border border-border bg-card">
                    {SAROH_APPS.map((app) => (
                        <li key={app.name}>
                            <a
                                href={sarohAppUrl(app, host)}
                                className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span>
                                    <span className="block text-sm font-medium">
                                        {app.name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {app.blurb}
                                    </span>
                                </span>
                                <ArrowUpRight
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                                />
                            </a>
                        </li>
                    ))}
                </ul>
            </PageContainer>
        </AdminShell>
    );
}
