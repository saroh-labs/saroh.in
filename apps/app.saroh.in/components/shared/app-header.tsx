import { getServerSession } from "@saroh/auth/next";
import { Wordmark } from "@saroh/ui/wordmark";
import { headers } from "next/headers";
import Link from "next/link";

import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { unreadNotificationCount } from "@/lib/notifications/service";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";

/**
 * The single app shell header, rendered once in the root layout so the brand,
 * org switcher, primary nav, and sign-out are present on EVERY authenticated
 * page — instead of being re-implemented per page (which is why Sites was
 * unreachable and subpages couldn't switch org or sign out). New pages inherit
 * the full chrome for free.
 */
const NAV = [
    { href: "/", label: "Stores" },
    { href: "/sites", label: "Sites" },
    { href: "/contacts", label: "Contacts" },
    { href: "/leads", label: "Leads" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/services", label: "Services" },
    { href: "/bookings", label: "Bookings" },
    { href: "/analytics", label: "Analytics" },
] as const;

export async function AppHeader() {
    // Non-throwing: the header renders inside the root layout, so it must not
    // redirect. Middleware already gates unauthenticated access; if there is no
    // session (or the org list can't load) we simply render nothing.
    const session = await getServerSession(await headers());
    if (!session) return null;

    const organizations = await listOrganizations();

    // Zero-org onboarding: no switcher/nav yet — just the brand + sign-out.
    if (organizations.length === 0) {
        return (
            <header className="border-b">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
                    <Link href="/" aria-label="Saroh">
                        <Wordmark />
                    </Link>
                    <SignOutButton />
                </div>
            </header>
        );
    }

    const activeOrg = await resolveActiveOrganization();
    const unread = await unreadNotificationCount();

    return (
        <header className="border-b">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-3">
                    <Link href="/" aria-label="Saroh" className="shrink-0">
                        <Wordmark />
                    </Link>
                    {activeOrg && (
                        <OrganizationSwitcher
                            organizations={organizations}
                            activeOrgId={activeOrg.id}
                        />
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <nav className="hidden items-center gap-4 text-sm lg:flex">
                        {NAV.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-muted-foreground hover:text-foreground hover:underline"
                            >
                                {item.label}
                            </Link>
                        ))}
                        <Link
                            href="/notifications"
                            className="relative text-muted-foreground hover:text-foreground hover:underline"
                        >
                            Notifications
                            {unread > 0 && (
                                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                                    {unread}
                                </span>
                            )}
                        </Link>
                    </nav>
                    <SignOutButton />
                </div>
            </div>
        </header>
    );
}
