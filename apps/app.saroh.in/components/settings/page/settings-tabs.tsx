"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { SETTINGS_PAGES } from "@/components/shared/navigation/nav-items";
import { useHeldIntegrationsNote } from "@/lib/providers/use-providers";
import { IN_PLACE_TABS, inPlaceTab } from "@/lib/settings/queries";
import { settingsPageLabel } from "@/lib/settings/search";
import { SectionList } from "@saroh/ui/section-list";

/**
 * The settings screen's tabs ("Saroh Settings" design): Business, Team,
 * Modules, Plan and billing, Your profile, Share, Activity and Providers in a
 * 232px column on Paper, ruled off from the page.
 * Each says in a line what it holds. Drawn by `SectionList`, the one look
 * for a column of sections (Website › Settings shares it): the current one
 * sits on the muted surface in semibold Ink. No Saffron marker; that is the
 * menu's alone.
 *
 * Below 1100px the lines of description drop, as the design has it: the page
 * needs the room more than the labels need glossing. Below 760px the column
 * becomes a row above the page that scrolls sideways, and says so (UX-079):
 * the row fades on the side with more tabs, and the open tab is scrolled
 * into view, so "Your p" cut off at the edge reads as more, not as broken.
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
    kind,
}: {
    hrefs: readonly string[];
    notes?: Partial<Record<string, string>>;
    /**
     * What is being set up (DEC-070): Business reads "Your details" for
     * Just me and A site for my work (`settingsPageLabel`).
     */
    kind?: string;
}) {
    const pathname = usePathname();
    // Integrations' own read knows its line better than the server's
    // render once a connect there has changed it.
    const held = useHeldIntegrationsNote();
    const noteOf = (href: string) =>
        href === "/settings/integrations" && held !== undefined
            ? (held ?? undefined)
            : notes?.[href];
    const pages = SETTINGS_PAGES.filter((page) => hrefs.includes(page.href));
    // In place there is no server render to write the title: it follows
    // the address here, Back and Forward included. The unread count in
    // front is the shell's to put back (`useUnreadTitle`).
    useEffect(() => {
        const here = inPlaceTab(pathname);
        if (!here) return;
        const title = (href: string) => {
            const page = SETTINGS_PAGES.find((p) => p.href === href);
            return page ? `${settingsPageLabel(page, kind)} · Settings` : "";
        };
        const want = title(here);
        for (const other of IN_PLACE_TABS) {
            const was = title(other);
            if (other !== here && document.title.includes(was)) {
                document.title = document.title.replace(was, want);
            }
        }
    }, [pathname, kind]);
    const current = pages.find(
        (page) =>
            pathname === page.href || pathname.startsWith(`${page.href}/`),
    );
    return (
        <SectionList
            label="Settings"
            heading="Settings"
            value={current?.href ?? null}
            idPrefix="settings-page"
            className="border-b border-border bg-background px-3 py-2.5 min-[760px]:w-[232px] min-[760px]:shrink-0 min-[760px]:overflow-y-auto min-[760px]:border-b-0 min-[760px]:border-r min-[760px]:px-2.5 min-[760px]:py-3.5"
            items={pages.map((page) => ({
                value: page.href,
                label: settingsPageLabel(page, kind),
                onNavigate:
                    current && inPlaceTab(current.href) && inPlaceTab(page.href)
                        ? (e: { preventDefault: () => void }) => {
                              e.preventDefault();
                              if (page.href !== pathname) {
                                  window.history.pushState(null, "", page.href);
                              }
                          }
                        : undefined,
                href: page.href,
                icon: page.icon,
                description: page.description,
                note: noteOf(page.href),
            }))}
        />
    );
}
