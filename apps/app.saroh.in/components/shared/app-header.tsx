import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { ThemeToggle } from "@/components/common/ThemeToggle";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { CommandTrigger } from "@/components/shared/command-trigger";
import { HelpLink } from "@/components/shared/help-link";
import { MobileNav } from "@/components/shared/mobile-nav";
import type { NavCounts } from "@/components/shared/nav-items";
import { SkinSwitcher } from "@/components/shared/skin-switcher";
import { UserMenu } from "@/components/shared/user-menu";
import type { Organization } from "@/lib/organizations/service";

/**
 * The slim top bar of the app shell. Primary navigation now lives in the
 * `AppSidebar` (desktop) / `MobileNav` (mobile), so this bar only carries
 * identity + session actions: the mobile nav trigger and brand on small
 * screens (the sidebar owns the brand at `lg+`), the org switcher, and
 * sign-out. It is presentational — `AppShell` fetches session/org/unread ONCE
 * and passes them in, so the session is never fetched twice per request.
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
          unread: number;
          /** `null` = availability unknown; see `filterNavGroups`. */
          moduleKeys: string[] | null;
          /** Work waiting behind a route; see `NavCounts`. */
          counts?: NavCounts;
          /** The merchant's own sites, for the drawer's tree. */
          sites?: { id: string; name: string }[];
      };

export function AppHeader(props: AppHeaderProps) {
    // Zero-org onboarding: no switcher/nav yet — brand + identity menu only.
    // The menu still appears (you must be able to see which account you are
    // completing onboarding as), minus the org-settings link, which has no
    // meaning before an org exists.
    if (props.onboarding) {
        /*
         * Sticky, like the rail. The bar carries search, the org switcher and
         * the account menu — the controls a merchant reaches for mid-page — and
         * it scrolled away with the page, so on any list longer than a screen
         * they were gone. `bg-background` because a sticky bar over scrolling
         * content is otherwise a bar you can read the page through; z-30 sits
         * above page content and below the command menu and toasts.
         */
        return (
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 sm:px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
                <div className="flex items-center gap-2">
                    <SkinSwitcher />
                    <UserMenu
                        name={props.user.name}
                        email={props.user.email}
                        showOrganizationSettings={false}
                    />
                </div>
            </header>
        );
    }

    const { organizations, activeOrg, unread, moduleKeys, counts, user } =
        props;

    return (
        // On a 390px phone this bar used to overflow by 40px and push the
        // account menu — the only route to sign-out — entirely off-screen.
        // The cause was flex children defaulting to `min-width: auto`, so
        // nothing could give while the org switcher reserved a flat 16rem.
        // Now the trailing controls hold their size and the switcher absorbs
        // whatever is left, truncating its label to fit any width.
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background px-2 min-[380px]:gap-3 min-[380px]:px-4 sm:gap-4 sm:px-6">
            <div className="flex shrink-0 items-center gap-1 min-[380px]:gap-2 sm:gap-3">
                <MobileNav
                    unread={unread}
                    moduleKeys={moduleKeys}
                    counts={counts}
                    sites={props.sites}
                    organizationName={activeOrg?.name}
                />
                {/*
                 * Hidden below 380px (#178, §18). At 320 the left group
                 * (menu + wordmark + search) and the right group (org switcher
                 * + four controls) together exceed the viewport, and because
                 * the right group is `justify-end` its children were laid out
                 * OVER the left group's — the org switcher sat on top of the
                 * search button. Nothing was unreachable, but two controls
                 * occupied the same pixels, which on a phone means tapping one
                 * and getting the other.
                 *
                 * The wordmark is what gives way because it is the only thing
                 * here that does nothing: the hamburger already opens
                 * navigation and the org switcher already says which workspace
                 * this is. It returns at `sm`.
                 *
                 * Hidden on every phone width, not just the narrowest. Once the
                 * controls grew to 44px touch targets (the whole point of #178)
                 * the header no longer fit at 390 either, and the org switcher
                 * went back to sitting on top of the search button.
                 */}
                <Link
                    href="/"
                    aria-label="Saroh"
                    className="hidden shrink-0 sm:block lg:hidden"
                >
                    <Wordmark />
                </Link>
                <CommandTrigger />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1 min-[380px]:gap-2 sm:gap-4">
                {activeOrg && (
                    <OrganizationSwitcher
                        organizations={organizations}
                        activeOrgId={activeOrg.id}
                    />
                )}
                {/* Gaps, not controls, give way below 380px. Every one of
                    these stays reachable on a phone — the skin picker has no
                    other home, so hiding it would strand it. */}
                <div className="flex shrink-0 items-center gap-0 min-[380px]:gap-1 sm:gap-2">
                    <HelpLink />
                    <SkinSwitcher />
                    <ThemeToggle />
                    <UserMenu name={user.name} email={user.email} />
                </div>
            </div>
        </header>
    );
}
