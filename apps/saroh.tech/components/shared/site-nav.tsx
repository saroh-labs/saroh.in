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
 * saroh.in's: Solutions, Features (every feature and "All features" to
 * /features), Website templates, Pricing, Resources (Document templates
 * among them) and Tools
 * (their own menus, owner 17 Nov 2026), then Sign in and Start free.
 * No Developers: Global has no API page yet. Below 1240px, the start button
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
            menu: {
                items: menus.solutions,
                columns: 2,
                // The /solutions hub: every trade at one moment of its day.
                seeAll: { name: NAV_WORDS.allTrades, href: "/solutions" },
            },
        },
        {
            id: "features",
            label: NAV_WORDS.howItWorks,
            menu: {
                items: menus.features,
                columns: 3,
                seeAll: HOW_IT_WORKS_ALL,
            },
        },
        // Website templates on top while templates are on, as on saroh.in;
        // Document templates are in Resources (owner, 16 Nov 2026).
        ...(menus.websiteTemplates
            ? [
                  {
                      id: "templates",
                      label: menus.websiteTemplates.name,
                      href: menus.websiteTemplates.href,
                  },
              ]
            : []),
        { id: "pricing", label: NAV_WORDS.pricing, href: "/pricing" },
        // Resources and Tools keep their own desk menus (owner, 17 Nov 2026):
        // the free tools are how people find saroh.tech.
        {
            id: "resources",
            label: NAV_WORDS.resources,
            menu: { items: menus.resources, columns: 2 },
        },
        {
            id: "tools",
            label: NAV_WORDS.tools,
            menu: { items: menus.tools, columns: 3, seeAll: menus.allTools },
        },
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
