"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SETTINGS_PAGES } from "@/components/shared/nav-items";

/**
 * The settings screen's tabs ("Saroh Settings" design): Business, Team,
 * Modules, Plan and billing, Your profile, Activity and Providers in a 232px
 * column on Paper, ruled off from the page.
 * Each says in a line what it holds. The current one takes the white surface
 * and the 2px Saffron marker, as the rail's current page does, so the two
 * lists read as one system.
 *
 * Below 1100px the lines of description drop, as the design has it: the page
 * needs the room more than the labels need glossing. Below 760px the column
 * becomes a row above the page that scrolls sideways.
 *
 * Links, not a client tab state: each tab is its own route, so the address,
 * Back and a shared link all land on the same tab. The layout passes only the
 * tabs this person may open.
 *
 * `notes` replaces a tab's line while something there needs a person
 * ("Needs you: email is disconnected"), except on that tab itself, whose page
 * says it in full. A note is shown at every width: it is news, not a gloss.
 */
export function SettingsTabs({
    hrefs,
    notes,
}: {
    hrefs: readonly string[];
    notes?: Partial<Record<string, string>>;
}) {
    const pathname = usePathname();
    const pages = SETTINGS_PAGES.filter((page) => hrefs.includes(page.href));
    return (
        <nav
            aria-label="Settings"
            className={cn(
                "flex gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2.5",
                "min-[760px]:w-[232px] min-[760px]:shrink-0 min-[760px]:flex-col min-[760px]:gap-0.5 min-[760px]:overflow-y-auto min-[760px]:border-b-0 min-[760px]:border-r min-[760px]:px-2.5 min-[760px]:py-3.5",
            )}
        >
            <p
                aria-hidden
                className="hidden px-2.5 pb-2 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground min-[760px]:block"
            >
                Settings
            </p>
            {pages.map((page) => {
                const on =
                    pathname === page.href ||
                    pathname.startsWith(`${page.href}/`);
                const Icon = page.icon;
                const note = on ? undefined : notes?.[page.href];
                return (
                    <Link
                        key={page.href}
                        href={page.href}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "relative flex shrink-0 items-start gap-2.5 rounded-lg px-2.5 py-[9px] text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                                ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(28,28,26,0.08)]"
                                : "font-medium text-foreground/80 hover:bg-muted",
                        )}
                    >
                        {on ? (
                            <span
                                aria-hidden
                                className="absolute -left-1.5 top-1/2 hidden h-[17px] w-0.5 -translate-y-1/2 rounded-[1px] bg-highlight min-[760px]:block"
                            />
                        ) : null}
                        <Icon
                            className="mt-px size-[18px] shrink-0"
                            strokeWidth={1.9}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px]">
                                {page.label}
                            </span>
                            {note ? (
                                <span className="mt-0.5 block text-pretty text-[11.5px] font-normal leading-[1.4] text-muted-foreground">
                                    {note}
                                </span>
                            ) : (
                                <span className="mt-0.5 hidden text-pretty text-[11.5px] font-normal leading-[1.4] text-muted-foreground min-[1100px]:block">
                                    {page.description}
                                </span>
                            )}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
