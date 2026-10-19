import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { Suspense } from "react";

import { AdminShell } from "@/components/admin-shell";
import { HomeCounts, NeedsYou } from "@/components/home/needs-you";
import { FailedPanel } from "@/components/states/failed-panel";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { requireStaff } from "@/lib/console";
import { getHome } from "@/lib/home";
import type { ConsoleHome } from "@/lib/home-words";
import { greeting, homeSummary } from "@/lib/home-words";

// Absolute: a layout's title template reaches its child segments, not the
// page beside it at the root.
export const metadata = { title: { absolute: "Home · Saroh console" } };

/**
 * Home (admin console redesign U10, R14): where every staff member lands.
 * "Needs you" lists what is waiting on someone, each row with the link to
 * its fix, and a few counts across Saroh sit under it. Health, which was
 * here, is `/health` under Keep it running.
 *
 * Every staff member may open it. Someone who may not read Saroh's counts
 * (an Account manager) gets the greeting and the way on: the menu and the
 * search.
 */
export default async function HomePage() {
    const gate = await requireStaff();
    if (!gate.ok) return gate.screen;

    return (
        <AdminShell staff={gate.staff}>
            <PageContainer width="wide">
                <PageHeader title={greeting()} />
                <Suspense
                    fallback={<PanelSkeleton label="Loading what needs you" />}
                >
                    <HomeBody />
                </Suspense>
            </PageContainer>
        </AdminShell>
    );
}

async function HomeBody() {
    let home: ConsoleHome | null;
    try {
        home = await getHome();
    } catch {
        return (
            <FailedPanel
                things="what needs you"
                reassurance="Every screen in the menu still opens."
            />
        );
    }
    return (
        <>
            <p className="-mt-4 text-[14px] text-muted-foreground">
                {homeSummary(home)}
            </p>
            {home && (
                <>
                    <NeedsYou needs={home.needs} />
                    <HomeCounts counts={home.counts} />
                </>
            )}
        </>
    );
}
