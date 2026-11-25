"use client";

import { PageContainer } from "@saroh/ui/page-container";
import type { ReactNode } from "react";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { HomeDashboard } from "@/components/home/dashboard/home-dashboard";
import { ReviewerHome } from "@/components/home/dashboard/reviewer-home";
import { StaffHome } from "@/components/home/dashboard/staff-home";
import { HomeHeader } from "@/components/home/header/home-header";
import { NewSpace } from "@/components/home/header/new-sheet";
import type { HomeNew } from "@/components/shared/navigation/quick-actions";
import { Moment } from "@/components/shared/notices/moment";
import { businessPage } from "@/lib/ask-ai/page-hints";
import {
    HomeReadAgain,
    HomeSaveContext,
    useHome,
    useHomeSaveWithQuery,
    useHomeSetup,
    useReadHomeAgain,
} from "@/lib/home/use-home";
import type { ModuleView } from "@/lib/modules/schema";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { checklistSubject, firstStepsLead } from "@/lib/settings/ready";

/**
 * Home on React Query (DEC-259): reads Home and "Finish setup" from their
 * queries in the browser, behind the shell's loader (`skeleton`) until
 * they land, and hands the same props as before to the parts, which stay
 * props-in. Which Home this is (Reviewer, staff, the business's) and what
 * it says (the moment, the news, the first run's jobs) come with Home's
 * read. A save on Home reads them again; nothing here refreshes the page.
 */
export function HomeContainer({
    name,
    businessName,
    kind,
    newMenu: menu,
    modules: allModules,
    setupShown,
    insights: insightsOpen,
    skeleton,
}: {
    name: string | null | undefined;
    businessName: string;
    kind: OrganizationKind;
    /** New (DEC-171), by the permissions; a Reviewer's Home has none. */
    newMenu: HomeNew;
    /** What is turned on; null when it couldn't be read. */
    modules: ModuleView[] | null;
    /** Whether this person is shown "Finish setup" (`access.ts`). */
    setupShown: boolean;
    /** Insights open to them and on (DEC-171); never on a Reviewer's Home. */
    insights: boolean;
    /** The shell's loader, until Home is read. */
    skeleton: ReactNode;
}) {
    const read = useHome();
    const home = read.data;
    // Asked beside Home, not after it: one round trip, not two. Shown only
    // on the business's Home with something on.
    const setupQuery = useHomeSetup(setupShown);
    const readAgain = useReadHomeAgain();
    const save = useHomeSaveWithQuery();
    const retry = () => void readAgain();
    // Home unread is the page's failure (`error.tsx`), as before.
    if (read.isError && !home) throw read.error;
    // "Finish setup" is waited for too, so it doesn't push the work down.
    if (!home || (setupShown && setupQuery.isPending)) return skeleton;
    const setup =
        home.hasAnyModule && home.view === "business"
            ? (setupQuery.data ?? null)
            : null;
    const reviewer = home.view === "reviewer";
    const newMenu = reviewer ? { items: [], roleLine: null } : menu;
    // A business with nothing on is asked what it wants to do first.
    const modules = reviewer || home.hasAnyModule ? null : allModules;
    const insights = !reviewer && home.view !== "staff" && insightsOpen;
    const { moment, invoicing } = home;
    // The news waits while Finish setup's first steps lead.
    const news = setup && firstStepsLead(setup.first) ? null : home.news;

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
                moment={home.news}
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
        <PageContainer width="full">
            <HomeSaveContext.Provider value={save}>
                <HomeReadAgain.Provider value={readAgain}>
                    {body}
                </HomeReadAgain.Provider>
            </HomeSaveContext.Provider>
        </PageContainer>
    );
}
