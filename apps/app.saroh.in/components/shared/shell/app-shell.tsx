import { getServerSession } from "@saroh/auth/next";
import { cookies, headers } from "next/headers";

import { PlanRefusalHost } from "@/components/billing/plan-refusal";
import { PlanAccessProvider } from "@/components/billing/plan-way";
import { ClosingBanner } from "@/components/organizations/closing/closing-banner";
import { BusinessZoneProvider } from "@/components/shared/dates/business-zone";
import {
    BusinessCountryProvider,
    BusinessCurrencyProvider,
} from "@/components/shared/fields/business-country";
import {
    navCan,
    NOTIFICATIONS_NAV,
} from "@/components/shared/navigation/nav-items";
import { PageContainer } from "@/components/shared/page/page-container";
import { QueryProvider } from "@/components/shared/query/query-provider";
import { BusinessTradeProvider } from "@/components/sites/templates/business-trade";
import { accountsUrl } from "@/lib/accounts";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { mayChangePlan } from "@/lib/billing/plan-access";
import { businessZone } from "@/lib/format/business-zone";
import { RAIL_COLLAPSED, RAIL_COOKIE } from "@/lib/nav/rail-cookie";
import { closingOrNull } from "@/lib/organizations/closing-service";
import type { Organization } from "@/lib/organizations/service";
import {
    activeOrganizationOnce,
    organizationsOnce,
} from "@/lib/organizations/service";
import { tradeOf } from "@/lib/organizations/trade";
import { usageSharingOrNull } from "@/lib/usage-sharing/service";
import { Button } from "@saroh/ui/button";
import { PausedState } from "@saroh/ui/data-state";
import { AppHeader } from "./app-header";
import { JoinedNotice } from "./joined-notice";
import { SetupFirst } from "./setup-first";
import {
    ShellAskAi,
    ShellCommandMenu,
    ShellHeader,
    ShellLiveRefresh,
    ShellPlanBanners,
    ShellSidebar,
    ShellTabBar,
    ShellWebsiteArea,
} from "./shell-reads";
import { recordingSwitchedOn, UsageRecording } from "./usage-recording";

/**
 * The authenticated app shell, rendered once in the root layout. On the
 * server it reads only what a gate needs: the session, the business list
 * and the open business (the person's role in it), once each. What the
 * chrome draws besides is read in the browser (`shell-reads.tsx`): the
 * settings once per load, the bell and the badges on the live refresh
 * (owner, 25 Nov 2026).
 *
 * Non-throwing by design: this renders inside the root layout on every page, so
 * it must not redirect. Middleware already gates unauthenticated access; with
 * no session we render the page bare (no chrome).
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(await headers());
    if (!session) return <>{children}</>;

    // Read once for the request: the layout's tab title uses the same two.
    const organizations = await organizationsOnce();

    // Zero-org onboarding: no sidebar yet — just a slim top bar (brand +
    // sign-out) so the funnel stays uncluttered. A business page sends them
    // to setup (`SetupFirst`); the list holds only this edition's (B5).
    if (organizations.length === 0) {
        return (
            <div className="flex min-h-screen flex-col">
                <AppHeader onboarding user={session.user} />
                <SetupFirst>{children}</SetupFirst>
            </div>
        );
    }

    // Reuse the already-fetched list instead of re-fetching it (#102).
    const activeOrg = await activeOrganizationOnce();
    // With a list there is always one (`pickActive`); never a shell keyed
    // to no business.
    if (!activeOrg) return <>{children}</>;

    // Every business they're in has paused their access (#800): the API
    // would refuse each read, so say why once instead of a page of denials.
    // Paused, not denied: no role changed, and the way back is the plan.
    if (activeOrg.paused) {
        return (
            <div className="flex min-h-screen flex-col">
                <AppHeader onboarding user={session.user} />
                <main id="main-content" className="flex-1">
                    <PageContainer>
                        <PausedState
                            business={activeOrg.name}
                            action={
                                <Button
                                    asChild
                                    variant="outline"
                                    className="wk-press"
                                >
                                    <a href={`${accountsUrl}/apps`}>
                                        Your businesses
                                    </a>
                                </Button>
                            }
                        />
                    </PageContainer>
                </main>
            </div>
        );
    }

    // Whether session recording is switched on for this environment
    // (DEC-125): a PostHog key and the replay switch. Off, nothing is read.
    const recordingOn = recordingSwitchedOn();
    const askAiShown = askAiOn() && activeOrg.role !== "REVIEWER";

    /*
     * Only what a gate needs is read here (owner, 25 Nov 2026): the person,
     * their businesses and their role in this one. What the chrome draws
     * besides (modules, plan, sites, storefronts, stock tracking, Ask AI,
     * the bell and the badges) is read in the browser, once per load and
     * again when a save changes it (`shell-reads.tsx`, `/api/shell`), not
     * on every server render. Two reads stay, each only when it is needed:
     * a business scheduled for deletion, and the person's recording choice,
     * which must be known before the recorder could start.
     */
    const [closing, usageSharing] = await Promise.all([
        // Scheduled for deletion (#921): the refunds still owed and the
        // memberships it won't cancel. Read only then.
        activeOrg.lifecycleStatus === "PENDING_DELETION"
            ? closingOrNull()
            : null,
        // "Help improve Saroh" (DEC-125): read before the recorder could
        // start, and only where session recording is switched on at all.
        recordingOn ? usageSharingOrNull() : null,
    ]);

    /*
     * Resolved once and handed to every navigation alike — the rail, the tab
     * bar and the command menu — so a role the business invented is offered
     * the same destinations in each.
     */
    const role = activeOrg.role;
    const actions = activeOrg.actions ?? null;
    // A location's team is offered Sell with Orders alone (DEC-074).
    const roleKey = activeOrg.roleKey ?? null;
    const kind = activeOrg.kind ?? null;
    // Whether this person has an inbox: the bell, its count, the title's.
    const inbox = navCan({ role, actions }, NOTIFICATIONS_NAV.action);

    return (
        <ShellFrame
            canChangePlan={mayChangePlan(activeOrg)}
            orgId={activeOrg.id}
            organizations={organizations}
        >
            {/*
             * Without this, reaching the page content by keyboard means tabbing
             * through the wordmark, search, every nav item, the org switcher,
             * the theme toggle and the account menu — on every single page.
             * Visible only when focused, so it costs sighted users nothing.
             */}
            <a
                data-ph-unmask=""
                href="#main-content"
                className="sr-only bg-background text-foreground outline-none focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                Skip to content
            </a>
            {/*
             * The role, alongside module availability, decides what the chrome
             * offers. Two different questions — does this business have the
             * capability, and may this person use it — and a merchant meets
             * both (#313). It comes off the resolved active organization, so
             * switching workspaces changes it with everything else.
             */}
            {/*
             * The page reads again by itself, the unread count sits in the
             * tab's title, and "signed out" gets its Sign in button (10 Oct
             * 2026). Draws nothing.
             */}
            <ShellLiveRefresh inbox={inbox} />
            <ShellCommandMenu
                role={role}
                roleKey={roleKey}
                actions={actions}
                kind={activeOrg.kind}
                // What was opened in this business, not in another.
                recentsScope={activeOrg.id}
            />
            {/* The top bar runs the full width; the rail and the working
                area sit below it. */}
            <ShellHeader
                user={session.user}
                organizations={organizations}
                activeOrg={activeOrg}
                askAiShown={askAiShown}
                inbox={inbox}
            />
            <div className="flex min-h-0 flex-1">
                <ShellSidebar
                    collapsed={
                        (await cookies()).get(RAIL_COOKIE)?.value ===
                        RAIL_COLLAPSED
                    }
                    role={role}
                    roleKey={roleKey}
                    actions={actions}
                    kind={kind}
                />
                {/* The working area is Paper like the rail, and the cards and
                tables on it are the white, raised surfaces (owner, 17 Nov
                2026, after the HP* boards; was white). Dark already worked
                this way: the ground, with cards a surface step up. */}
                <div className="flex min-w-0 flex-1 flex-col bg-background">
                    {/*
                     * `tabIndex={-1}` makes this a valid focus target: following the
                     * skip link must MOVE focus, not just scroll, or the next Tab
                     * would land back at the top of the nav.
                     */}
                    {/*
                     * Padded by the tab bar's height below 760px (0 above;
                     * `--tab-bar-inset` in workspace.css), so the last row
                     * of a page scrolls clear of the bar instead of ending
                     * underneath it.
                     */}
                    <div
                        id="main-content"
                        tabIndex={-1}
                        className="flex flex-1 flex-col pb-[var(--tab-bar-inset)] outline-none"
                    >
                        {/*
                         * The business's zone (UX-008): every time a page
                         * writes with `BusinessDate` reads as the business
                         * keeps it, on the server's first paint too.
                         */}
                        <BusinessZoneProvider zone={businessZone(activeOrg)}>
                            {/* Its country: where a phone field starts (#1036). */}
                            <BusinessCountryProvider
                                country={activeOrg.country}
                            >
                                {/* Its trade: the templates suggested first (DEC-216). */}
                                <BusinessTradeProvider
                                    trade={tradeOf(activeOrg.trade)}
                                    tradeOther={activeOrg.tradeOther ?? null}
                                    startTemplate={
                                        activeOrg.startTemplate ?? null
                                    }
                                    canSetTrade={
                                        activeOrg.actions?.includes(
                                            "org:update",
                                        ) === true
                                    }
                                >
                                    {/*
                                     * PostHog in the signed-in shell (DEC-125):
                                     * internal ids beside the workspace's error
                                     * reports, the one-time notice that it is
                                     * recorded, and the recorder, which waits for
                                     * that notice. Nothing without a key.
                                     */}
                                    <UsageRecording
                                        userId={session.user.id}
                                        organizationId={activeOrg.id}
                                        usage={usageSharing}
                                    />
                                    {/* Scheduled for deletion (#921). */}
                                    <ClosingBanner view={closing} />
                                    {/* The plan's banners (DEC-210, #805, #800). */}
                                    <ShellPlanBanners />
                                    <BusinessCurrencyProvider
                                        value={activeOrg.currency ?? null}
                                    >
                                        {/* Just accepted an invitation: which business
                                this is and what their role opens, once. */}
                                        <JoinedNotice />
                                        {children}
                                    </BusinessCurrencyProvider>
                                </BusinessTradeProvider>
                            </BusinessCountryProvider>
                        </BusinessZoneProvider>
                    </div>
                </div>
            </div>
            {/* A write the plan refused, shown as its notice (U14). */}
            <PlanRefusalHost />
            {askAiShown ? (
                <ShellAskAi
                    businessName={activeOrg.name}
                    zone={businessZone(activeOrg)}
                />
            ) : null}
            {/* Below 760px, the rail's place is taken by this. */}
            <ShellTabBar
                role={role}
                roleKey={roleKey}
                actions={actions}
                kind={kind}
            />
        </ShellFrame>
    );
}

/**
 * The shell's outer box, which also says once whether this person may
 * change the plan (`billing:manage`): every plan prompt under it offers the
 * way to another plan to someone who may, and says who can to anyone else
 * (`PlanWay`).
 */
function ShellFrame({
    canChangePlan,
    orgId,
    organizations,
    children,
}: {
    canChangePlan: boolean;
    orgId: string;
    organizations: Organization[];
    children: React.ReactNode;
}) {
    return (
        // React Query, once for the app (DEC-259), with the list this
        // render already read.
        <QueryProvider orgId={orgId} organizations={organizations}>
            <PlanAccessProvider canChangePlan={canChangePlan}>
                <ShellWebsiteArea>
                    <div className="flex min-h-screen flex-col">{children}</div>
                </ShellWebsiteArea>
            </PlanAccessProvider>
        </QueryProvider>
    );
}
