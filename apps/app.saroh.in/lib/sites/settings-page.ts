import {
    describePendingChanges,
    pendingChangeCount,
} from "@/lib/sites/pending";
import type { SiteDetail, SitePage } from "@/lib/sites/service";

/**
 * The words and rules of a site's Settings tab (Website › Settings audit,
 * 9 Oct 2026): its six groups, the "Before you share your site" checklist,
 * the values the live site actually uses when nothing is written, and the
 * one bar that says what waits for the next publish. Pure, so the editable
 * view and the read-only one say the same thing.
 */

/** The groups, in the order they appear and the in-page list names them. */
export const SETTINGS_GROUPS = [
    { id: "address", label: "Address" },
    { id: "search-and-sharing", label: "Search and sharing" },
    { id: "menu-and-footer", label: "Menu and footer" },
    { id: "shop", label: "Shop" },
    { id: "tracking", label: "Tracking" },
    { id: "advanced", label: "Advanced" },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

/** The open group's tab, in the address as Settings › Business keeps its own. */
export const SETTINGS_TAB_PARAM = "section";

/**
 * The groups this screen draws. Shop only while the online shop is open
 * for the business (`sellsFrom`, the API's `SITE_SHOP`), and Advanced only
 * while it holds something (publishing approval, DEC-071).
 */
export function settingsGroups({
    shop,
    advanced,
}: {
    shop: boolean;
    advanced: boolean;
}): { id: SettingsGroupId; label: string }[] {
    return SETTINGS_GROUPS.filter(
        (g) => (g.id !== "shop" || shop) && (g.id !== "advanced" || advanced),
    );
}

/** The rows the checklist jumps to. */
export const ROW_ANCHORS = {
    title: "settings-title",
    description: "settings-description",
    image: "settings-share-image",
    menu: "settings-menu",
} as const;

export type ShareStepKey = keyof typeof ROW_ANCHORS;

/** The tab that holds a checklist step's row. */
export function groupOfStep(key: ShareStepKey): SettingsGroupId {
    return key === "menu" ? "menu-and-footer" : "search-and-sharing";
}

export interface ShareStep {
    key: ShareStepKey;
    /** What the step is, as the list says it. */
    label: string;
    done: boolean;
    /** What is in use, for a step that is done ("using Rye"). */
    note: string | null;
    /** The row's id, to jump to. */
    anchor: string;
}

type ReadinessSite = Pick<
    SiteDetail,
    "name" | "seoTitle" | "seoDescription" | "socialImageUrl" | "navigation"
> & {
    pages: Pick<SitePage, "path" | "isHome" | "hidden" | "kind" | "inMenu">[];
};

const filled = (v: string | null | undefined): v is string =>
    typeof v === "string" && v.trim() !== "";

/** The name a site goes by: the search title falls back to it. */
export function siteNameOf(site: Pick<SiteDetail, "name">): string {
    return site.name.trim() || "Untitled site";
}

/**
 * Whether the site has pages a menu would have to list: a visible
 * free-form page other than home, not taken out of the menu on purpose.
 * Module pages join the live menu on their own (G14), so they never need
 * one. The same rule as the pre-publish check's "no menu yet" flag
 * (`site-flags.ts`).
 */
export function menuNeeded(site: Pick<ReadinessSite, "pages">): boolean {
    return site.pages.some(
        (p) =>
            !p.hidden &&
            !p.isHome &&
            p.path !== "/" &&
            (p.kind ?? "FREE") === "FREE" &&
            p.inMenu !== false,
    );
}

/**
 * "Before you share your site": only the steps that are true to ask for,
 * starting from what is already done.
 *
 * - The search title is done when one is written, or when the site's name
 *   stands in for it, which is what the live site's `<title>` uses
 *   (`apps/saroh.app/app/[domain]/layout.tsx`).
 * - A description and a share image have no stand-in: without them the
 *   apps choose for themselves.
 * - The menu is asked for only while a page needs one.
 */
export function shareReadiness(site: ReadinessSite): ShareStep[] {
    const steps: ShareStep[] = [
        {
            key: "title",
            label: "Search title",
            done: true,
            note: filled(site.seoTitle)
                ? site.seoTitle.trim()
                : `using ${siteNameOf(site)}`,
            anchor: ROW_ANCHORS.title,
        },
        {
            key: "description",
            label: "A one-line description for Google and WhatsApp",
            done: filled(site.seoDescription),
            note: null,
            anchor: ROW_ANCHORS.description,
        },
        {
            key: "image",
            label: "A share image",
            done: filled(site.socialImageUrl),
            note: null,
            anchor: ROW_ANCHORS.image,
        },
    ];
    const built = (site.navigation?.items.length ?? 0) > 0;
    if (built || menuNeeded(site)) {
        steps.push({
            key: "menu",
            label: "The menu",
            done: built,
            note: null,
            anchor: ROW_ANCHORS.menu,
        });
    }
    return steps;
}

/** "2 of 4": how many are done, of how many. */
export function readinessCount(steps: readonly ShareStep[]): {
    done: number;
    of: number;
} {
    return { done: steps.filter((s) => s.done).length, of: steps.length };
}

/**
 * The module pages the live menu lists on its own while no menu is built
 * (`resolveSiteNavigation`): "Shop · Book". Empty when there are none.
 */
export function automaticMenu(site: {
    pages: Pick<SitePage, "title" | "kind" | "hidden" | "inMenu">[];
}): string[] {
    return site.pages
        .filter(
            (p) =>
                !p.hidden &&
                p.inMenu !== false &&
                p.kind !== undefined &&
                p.kind !== "FREE",
        )
        .map((p) => p.title);
}

/** The bar at the foot of the page, or null when nothing waits. */
export interface PublishWaiting {
    line: string;
}

/**
 * What waits for the next publish, from the API's own diff (#190, #282):
 * the same count and words as the editor's bar and the sites list. Only
 * real changes are counted.
 *
 * - Never published: everything here waits for the first publish.
 * - Live with changes: "3 changes wait for your next publish: …".
 * - Live, something waiting the diff can't name: said without a number.
 * - Live and matching the draft: nothing, so no bar.
 */
export function publishWaiting(
    site: Pick<
        SiteDetail,
        "currentPublication" | "pendingSectionChanges" | "pendingSiteChanges"
    > & { hasUnpublishedChanges?: boolean },
): PublishWaiting | null {
    if (!site.currentPublication) {
        return {
            line: "Your site isn't published yet. Nobody can reach it until you publish.",
        };
    }
    const count = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );
    const what = describePendingChanges(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );
    if (count > 0 && what) {
        return {
            line: `${count === 1 ? "1 change waits" : `${count} changes wait`} for your next publish: ${what}.`,
        };
    }
    if (site.hasUnpublishedChanges) {
        return { line: "Some changes wait for your next publish." };
    }
    return null;
}
