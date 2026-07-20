import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { CommandMenu } from "@/components/shared/command-menu";
import { unreadNotificationCount } from "@/lib/notifications/service";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";

/**
 * The authenticated app shell, rendered once in the root layout. It is the
 * SINGLE server-side fetcher for the chrome — session, org list, active org,
 * and unread count are read here exactly once and passed as props to the
 * (client) `AppSidebar` / `MobileNav` and the presentational `AppHeader`.
 * `getServerSession` is a `no-store` network call, so consolidating the fetch
 * here (instead of each chrome piece fetching) avoids duplicate round-trips.
 *
 * Non-throwing by design: this renders inside the root layout on every page, so
 * it must not redirect. Middleware already gates unauthenticated access; with
 * no session we render the page bare (no chrome).
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(await headers());
    if (!session) return <>{children}</>;

    const organizations = await listOrganizations();

    // Zero-org onboarding: no sidebar yet — just a slim top bar (brand +
    // sign-out) so the funnel stays uncluttered.
    if (organizations.length === 0) {
        return (
            <div className="flex min-h-screen flex-col">
                <AppHeader onboarding />
                {children}
            </div>
        );
    }

    // Reuse the already-fetched list instead of re-fetching it (#102).
    const activeOrg = await resolveActiveOrganization(organizations);
    const unread = await unreadNotificationCount();

    return (
        <div className="flex min-h-screen">
            <CommandMenu />
            <AppSidebar unread={unread} />
            <div className="flex min-w-0 flex-1 flex-col">
                <AppHeader
                    organizations={organizations}
                    activeOrg={activeOrg}
                    unread={unread}
                />
                {children}
            </div>
        </div>
    );
}
