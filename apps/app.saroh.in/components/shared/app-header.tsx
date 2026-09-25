import { SarohSymbol, Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { CommandTrigger } from "@/components/shared/command-trigger";
import { HelpLink } from "@/components/shared/help-link";
import { NotificationsLink } from "@/components/shared/notifications-link";
import { SkinSwitcher } from "@/components/shared/skin-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/shared/user-menu";
import type { Organization } from "@/lib/organizations/service";

/**
 * The top bar, across the full width above the rail (the "Saroh Products
 * Screen" design). Left: the mark, a slash, and the business switcher — the
 * business is the one scope above a screen, so it is said once, here. Right:
 * search, notifications, help, and your account. Everything else is the
 * rail's job.
 *
 * It sits on Paper with the rail, so the working area below is the one white
 * surface. Presentational: `AppShell` fetches session, organization and
 * unread once and passes them in.
 */
/** The signed-in user, for the identity menu. */
export interface HeaderUser {
    name?: string | null;
    email: string;
}

type AppHeaderProps =
    | { onboarding: true; user: HeaderUser }
    | {
          onboarding?: false;
          user: HeaderUser;
          organizations: Organization[];
          activeOrg: Organization | null;
          /**
           * Unread notifications, or `null` when the actor may not read
           * them — then there is no bell.
           */
          unread: number | null;
      };

export function AppHeader(props: AppHeaderProps) {
    // Zero-org onboarding: no switcher and no nav yet — the brand and the
    // account menu only, so you can see which account you are onboarding as.
    if (props.onboarding) {
        return (
            <header className="sticky top-0 z-30 flex h-[61px] items-center justify-between border-b bg-background px-3.5 py-[9px]">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
                <div className="flex items-center gap-1.5">
                    <ThemeToggle />
                    <SkinSwitcher />
                    <UserMenu name={props.user.name} email={props.user.email} />
                </div>
            </header>
        );
    }

    const { organizations, activeOrg, user, unread } = props;

    return (
        // Gaps, not controls, give way on a phone: the switcher's name
        // truncates, and search, help and the account button keep their size.
        // No menu button: below 760px the tab bar at the foot of the screen
        // is the navigation, so the header only says where you are.
        <header className="sticky top-0 z-30 flex h-[61px] items-center gap-1 border-b bg-background px-2 py-[9px] sm:px-3.5 print:hidden">
            <Link
                href="/"
                aria-label="Saroh — go to Home"
                className="flex shrink-0 items-center rounded-lg px-[7px] py-[5px] transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
                <SarohSymbol size={22} />
            </Link>
            <span aria-hidden className="px-px text-[15px] text-border-strong">
                /
            </span>
            {activeOrg ? (
                <OrganizationSwitcher
                    organizations={organizations}
                    activeOrgId={activeOrg.id}
                />
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <CommandTrigger
                    actor={{
                        role: activeOrg?.role ?? null,
                        actions: activeOrg?.actions ?? null,
                    }}
                />
                {unread !== null ? <NotificationsLink unread={unread} /> : null}
                <HelpLink />
                <ThemeToggle />
                {/* Renders nothing while only one skin is offered. */}
                <SkinSwitcher />
                <UserMenu
                    name={user.name}
                    email={user.email}
                    businessName={activeOrg?.name}
                />
            </div>
        </header>
    );
}
