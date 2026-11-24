"use client";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { HomeDashboard } from "@/components/home/dashboard/home-dashboard";
import { ReviewerHome } from "@/components/home/dashboard/reviewer-home";
import { StaffHome } from "@/components/home/dashboard/staff-home";
import { HomeHeader } from "@/components/home/header/home-header";
import { NewSpace } from "@/components/home/header/new-sheet";
import type { HomeNew } from "@/components/shared/navigation/quick-actions";
import { Moment } from "@/components/shared/notices/moment";
import { businessPage } from "@/lib/ask-ai/page-hints";
import type { InvoiceJobFacts } from "@/lib/home/first-run";
import {
    HomeReadAgain,
    HomeSaveContext,
    useHome,
    useHomeSaveWithQuery,
    useHomeSetup,
    useReadHomeAgain,
} from "@/lib/home/use-home";
import type { ModuleView } from "@/lib/modules/schema";
import type { MomentView } from "@/lib/moments/keys";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { checklistSubject, firstStepsLead } from "@/lib/settings/ready";

/**
 * Home on React Query (DEC-259): reads Home and "Finish setup" from their
 * queries, hydrated by the page, and hands the same props as before to the
 * parts, which stay props-in. A save on Home reads them again; nothing
 * here refreshes the page.
 */
export function HomeContainer({
    name,
    businessName,
    kind,
    newMenu,
    modules,
    setupShown,
    invoicing,
    insights,
    moment,
    news,
}: {
    name: string | null | undefined;
    businessName: string;
    kind: OrganizationKind;
    newMenu: HomeNew;
    modules: ModuleView[] | null;
    /** Whether this person is shown "Finish setup" (`access.ts`). */
    setupShown: boolean;
    invoicing?: InvoiceJobFacts;
    insights: boolean;
    moment: MomentView | null;
    news: MomentView | null;
}) {
    const home = useHome().data;
    const setupQuery = useHomeSetup(
        setupShown && !!home?.hasAnyModule && home.view === "business",
    );
    const readAgain = useReadHomeAgain();
    const save = useHomeSaveWithQuery();
    const retry = () => void readAgain();
    // Hydrated by the page, which fails as a whole when Home can't be read.
    if (!home) return null;
    const setup = home.hasAnyModule ? (setupQuery.data ?? null) : null;

    let body: React.ReactNode;
    if (home.view === "reviewer") {
        // A Reviewer's Home (F9): the greeting and what was sent to them.
        body = (
            <>
                <HomeHeader
                    lastDay={home.lastDay}
                    name={name}
                    businessName={businessName}
                />
                <div className="mt-5">
                    <ReviewerHome home={home} onRetry={retry} />
                </div>
            </>
        );
    } else if (home.view === "staff") {
        // A staff member's Home (F11): their storefronts and own diary.
        body = (
            <StaffHome
                moment={moment}
                home={home}
                modules={modules}
                name={name}
                businessName={businessName}
                newMenu={newMenu}
            />
        );
    } else {
        body = (
            <>
                <HomeHeader
                    lastDay={home.lastDay}
                    name={name}
                    businessName={businessName}
                    kind={kind}
                    // The line under the greeting follows the checklist below.
                    subject={
                        setup
                            ? firstStepsLead(setup.first)
                                ? "setup"
                                : checklistSubject(setup.list)
                            : null
                    }
                    newMenu={newMenu}
                    // The phone Home says it in the day sheet (U17).
                    sinceOnPhone={!home.hasAnyModule}
                />
                {/* What Ask AI offers here, from Home's own figures (AF 1). */}
                <AskAiPageIs
                    page={businessPage({
                        today: home.lastDay?.date,
                        dueToday: home.tiles?.toPack?.dueToday,
                        bookings: !!home.tiles?.bookingsToday,
                    })}
                />
                {moment ? <Moment moment={moment} className="mt-5" /> : null}
                <div className="mt-5">
                    <HomeDashboard
                        home={home}
                        modules={modules}
                        businessName={businessName}
                        setup={setup}
                        kind={kind}
                        invoicing={invoicing}
                        insights={insights}
                        news={news}
                        onRetry={retry}
                    />
                </div>
                {newMenu.items.length > 0 ? <NewSpace /> : null}
            </>
        );
    }
    return (
        <HomeSaveContext.Provider value={save}>
            <HomeReadAgain.Provider value={readAgain}>
                {body}
            </HomeReadAgain.Provider>
        </HomeSaveContext.Provider>
    );
}
