"use client";

import { cn } from "@saroh/marketing/cn";
import dynamic from "next/dynamic";

import type { Visitor } from "@/lib/browser/session";
import { DASHBOARD_URL } from "@/lib/links";
import { ring } from "@saroh/marketing/ring";

import { NAV_WORDS } from "@/content/nav";
import { ButtonLink } from "@saroh/marketing/button";
import { usePhoneMenu } from "@saroh/marketing/use-phone-menu";
import { CtaLink } from "../buttons/cta-link";

import type { NavMenus, NavSection } from "./nav-section";
import { splitResources } from "./nav-section";

/** The sheet, fetched on the first tap of Menu. */
const MobileSheet = dynamic(
    () => import("./mobile-sheet").then((m) => m.MobileSheet),
    { ssr: false },
);
/**
 * The phone nav (below 1240px, Nav design): the start button and a Menu
 * button that opens a full-screen sheet: Solutions, How it works, Templates,
 * Pricing (once the launch switch is open), Developers and (when any page is
 * live) Resources and Tools,
 * each menu a level of its own with a Back, and Sign in and the start button
 * held at the bottom (owner, 1 Nov). Esc or × closes it and returns focus to
 * Menu; while it is open, focus stays inside. Signed in, the start button is
 * "Open dashboard" and the sheet's Sign in is the visitor, Account and Sign out.
 */
export function MobileMenu({
    section,
    pathname,
    visitor = null,
    onSignOut,
    className,
    startClassName,
    ...menus
}: NavMenus & {
    section: NavSection;
    pathname: string;
    visitor?: Visitor | null;
    onSignOut?: () => Promise<void>;
    className?: string;
    /** On the start button: hidden while the page's sticky bar shows. */
    startClassName?: string;
}) {
    const [open, setOpen] = usePhoneMenu(pathname);
    const close = () => setOpen(false);
    const split = splitResources(menus.resources ?? []);

    return (
        <div
            className={cn(
                "flex items-center gap-3 min-[400px]:gap-6",
                className,
            )}
        >
            {visitor ? (
                <ButtonLink
                    href={DASHBOARD_URL}
                    size="sm"
                    className="px-4 max-[399px]:px-3.5"
                >
                    Open dashboard
                </ButtonLink>
            ) : (
                <CtaLink
                    src="nav"
                    size="sm"
                    short
                    className={cn("px-4 max-[399px]:px-3.5", startClassName)}
                />
            )}
            <button
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                aria-controls={open ? "nav-sheet" : undefined}
                onClick={() => setOpen(true)}
                className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-border-strong bg-transparent text-foreground hover:bg-mk-hover ${ring()}`}
            >
                <span aria-hidden className="grid gap-1">
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                </span>
            </button>
            {open ? (
                <MobileSheet
                    section={section}
                    pathname={pathname}
                    featuresLabel={NAV_WORDS.howItWorks}
                    templatesPage={split.templates}
                    resources={split.rest}
                    tools={menus.tools ?? []}
                    featureItems={menus.features}
                    solutionItems={menus.solutions}
                    solutionMenu={menus.solutionMenu}
                    allTrades={menus.allTrades}
                    allTools={menus.allTools}
                    visitor={visitor}
                    onSignOut={async () => {
                        close();
                        await onSignOut?.();
                    }}
                    onClose={close}
                />
            ) : null}
        </div>
    );
}
