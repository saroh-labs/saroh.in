"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SETTINGS_PAGES } from "@/components/shared/nav-items";

/**
 * The settings screen's tabs (2026-09-25): Business, Team, Modules and
 * Providers down the left, the page you picked on the right.
 *
 * Drawn like the storefront list on Storefronts — a bordered card, a small
 * heading, rows that take the muted surface when current — so the two
 * "pick one, see it beside the list" screens read alike. Below 760px there
 * is no room beside the page, so the tabs sit above it in a row that
 * scrolls sideways.
 *
 * Links, not a client tab state: each tab is its own route, so the address,
 * Back and a shared link all land on the same tab. The layout passes only the
 * tabs this person may open.
 */
export function SettingsTabs({ hrefs }: { hrefs: readonly string[] }) {
    const pathname = usePathname();
    const pages = SETTINGS_PAGES.filter((page) => hrefs.includes(page.href));
    return (
        <nav
            aria-label="Settings"
            className="min-[760px]:w-[236px] min-[760px]:shrink-0 min-[760px]:self-start min-[760px]:overflow-hidden min-[760px]:rounded-xl min-[760px]:border min-[760px]:border-border"
        >
            <p className="hidden border-b border-border px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground min-[760px]:block">
                Settings
            </p>
            <ul className="flex gap-1 overflow-x-auto p-1.5 min-[760px]:flex-col min-[760px]:gap-0.5 min-[760px]:overflow-visible">
                {pages.map((page) => {
                    const on =
                        pathname === page.href ||
                        pathname.startsWith(`${page.href}/`);
                    const Icon = page.icon;
                    return (
                        <li key={page.href} className="shrink-0">
                            <Link
                                href={page.href}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "flex min-h-11 items-center gap-[9px] rounded-lg px-[9px] py-[7px] text-[13.5px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                )}
                            >
                                <Icon className="size-4 shrink-0" />
                                {page.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
