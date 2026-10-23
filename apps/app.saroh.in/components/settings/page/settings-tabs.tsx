"use client";

import { usePathname } from "next/navigation";

import { SETTINGS_PAGES } from "@/components/shared/navigation/nav-items";
import { SectionList } from "@/components/shared/page/section-list";
import { settingsPageLabel } from "@/lib/settings/search";

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
    const pages = SETTINGS_PAGES.filter((page) => hrefs.includes(page.href));
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
                href: page.href,
                icon: page.icon,
                description: page.description,
                note: notes?.[page.href],
            }))}
        />
    );
}
