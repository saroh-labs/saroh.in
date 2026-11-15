"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { STICKY_HIDES } from "@saroh/marketing/kit/sticky-bar";
import type { NavEntry } from "@saroh/marketing/marketing-nav";
import { MarketingNav, NAV_TOP } from "@saroh/marketing/marketing-nav";
import { usePathname } from "next/navigation";

import type { NavMenus } from "@/lib/nav";
import { HOW_IT_WORKS_ALL, NAV_WORDS } from "@/lib/nav";
import { sectionOf } from "@/lib/nav-section";

import { PhoneMenu } from "./phone-menu";

/**
 * saroh.tech's nav, on the redesign's shared `MarketingNav` (DEC-221), as
 * saroh.in's: Solutions, How it works (every feature, "How Saroh works" to
 * /features, and Resources and the tools hub folded into its strip),
 * Templates (its gallery menu) and Pricing, then Sign in and Start free.
 * No Developers: Global has no API page yet. Below 760px, the start button
 * and `PhoneMenu`, whose sheet keeps Resources and Tools as levels.
 */
export function SiteNav({
    menus,
    signIn,
    start,
    startInSheet,
}: {
    menus: NavMenus;
    signIn: string;
    start: string;
    startInSheet: string;
}) {
    const pathname = usePathname();
    const section = sectionOf(pathname);
    const entries: NavEntry[] = [
        {
            id: "solutions",
            label: NAV_WORDS.solutions,
            menu: { items: menus.solutions, columns: 2 },
        },
        {
            id: "features",
            label: NAV_WORDS.howItWorks,
            menu: {
                items: menus.features,
                columns: 3,
                seeAll: HOW_IT_WORKS_ALL,
                // What the Resources and Tools menus held.
                links: [
                    ...menus.resources.map((r) => ({
                        name: r.name,
                        href: r.href,
                    })),
                    menus.allTools,
                ],
            },
        },
        {
            id: "templates",
            label: NAV_WORDS.templates,
            menu: {
                items: menus.templates,
                columns: 3,
                seeAll: menus.allTemplates,
            },
        },
        { id: "pricing", label: NAV_WORDS.pricing, href: "/pricing" },
    ];
    return (
        <MarketingNav
            entries={entries}
            current={section}
            pathname={pathname}
            prefetch={false}
            end={() => (
                <>
                    <a
                        href={signIn}
                        data-cta="sign-in"
                        className={cn(NAV_TOP, "font-semibold text-foreground")}
                    >
                        {NAV_WORDS.signIn}
                    </a>
                    <ButtonLink size="kit" href={start} data-cta="start-free">
                        Start free
                    </ButtonLink>
                </>
            )}
            phone={() => (
                <PhoneMenu
                    {...menus}
                    section={section}
                    pathname={pathname}
                    signIn={signIn}
                    start={start}
                    startInSheet={startInSheet}
                    startClassName={STICKY_HIDES}
                />
            )}
        />
    );
}
