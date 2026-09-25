import type { NavRole } from "@/components/shared/nav-items";
import {
    SETTINGS_PAGES,
    settingsPagesFor,
} from "@/components/shared/nav-items";

/**
 * Search settings ("Saroh Settings" design): the things a person comes to
 * Settings to change, each with the page and tab it lives on, so typing
 * "GSTIN" lands on Business › Tax and invoices rather than on Business and a
 * hunt through four tabs.
 *
 * Only what the screens actually show. The design also lists "Email sender
 * (Postmark)"; Saroh sends email through Resend and names no provider on the
 * Providers page, so the entry says what the page holds instead.
 *
 * The header's search button opens this on the settings screen, and the ⌘K
 * menu reads the same list, so both find a setting by the same words.
 */

type SettingsHref = (typeof SETTINGS_PAGES)[number]["href"];

/** The query a settings page reads its own tab from. */
export const BUSINESS_TAB_PARAM = "section";
export const TEAM_TAB_PARAM = "view";

export interface SettingsEntry {
    label: string;
    page: SettingsHref;
    /** The tab on that page, as its query (`?section=tax`). */
    tab?: { param: string; value: string };
    /**
     * Needed on top of the page's own action. Offered only to someone who
     * holds it — "invite" is not a word to show a person who may not.
     */
    action?: string;
    /** Withheld from someone who holds this; the other half of a pair. */
    unless?: string;
}

const business = (label: string, value: string): SettingsEntry => ({
    label,
    page: "/settings/organization",
    tab: { param: BUSINESS_TAB_PARAM, value },
});

const team = (label: string, value: string): SettingsEntry => ({
    label,
    page: "/settings/people",
    tab: { param: TEAM_TAB_PARAM, value },
});

/**
 * In the design's order: Business by its tabs, then Team, Modules, Plan and
 * billing, Your profile, Providers.
 */
export const SETTINGS_INDEX: readonly SettingsEntry[] = [
    business("Business name", "identity"),
    business("Logo", "identity"),
    business("Legal name", "identity"),
    business("Type of business", "identity"),
    business("Trading since", "identity"),
    business("Workspace address", "identity"),
    business("Contact email", "contact"),
    business("Website", "contact"),
    business("GST registration", "tax"),
    business("GSTIN or tax ID", "tax"),
    business("Invoice prefix and numbers", "tax"),
    business("Invoice number format", "tax"),
    business("Financial year", "tax"),
    business("GST on delivery", "tax"),
    business("Delivery SAC", "tax"),
    business("Registered address", "address"),
    business("PIN code", "address"),
    business("State", "address"),
    business("Country", "address"),
    team("Roles and what they open", "roles"),
    {
        ...team("People — invite or change a role", "people"),
        action: "member:invite",
    },
    {
        ...team("People on the team", "people"),
        unless: "member:invite",
    },
    { label: "Modules — Sell, Payments, Website…", page: "/settings/modules" },
    { label: "Contacts pipeline", page: "/settings/modules" },
    { label: "Plan and billing", page: "/settings/billing" },
    { label: "Change plan", page: "/settings/billing" },
    { label: "Invoices from Saroh", page: "/settings/billing" },
    { label: "Your profile and password", page: "/settings/profile" },
    { label: "Alerts — email, WhatsApp", page: "/settings/profile" },
    {
        label: "Providers — hosting, email, payments",
        page: "/settings/providers",
    },
    { label: "Email and WhatsApp sender", page: "/settings/providers" },
    { label: "Payment provider", page: "/settings/providers" },
];

export interface SettingsActor {
    role: NavRole | null;
    actions?: readonly string[] | null;
}

/**
 * Does this actor hold `action`? The API's resolved permissions when there
 * are some, else what an owner or admin holds — the pages' own fallback.
 */
function holds(actor: SettingsActor, action: string): boolean {
    if (actor.actions) return actor.actions.includes(action);
    return (
        actor.role === null || actor.role === "OWNER" || actor.role === "ADMIN"
    );
}

export interface SettingsHit {
    label: string;
    /** The page it lives on, as its tab is named ("Business"). */
    where: string;
    href: string;
}

export function settingsEntryHref(entry: SettingsEntry): string {
    if (!entry.tab) return entry.page;
    return `${entry.page}?${new URLSearchParams({ [entry.tab.param]: entry.tab.value })}`;
}

/**
 * The settings this actor may see that match `query`, in index order.
 *
 * A match is the words typed appearing in the setting's name — or, with
 * `byPage`, in the page's ("team" lists the Team settings), as the design
 * does. The ⌘K menu leaves `byPage` off: its own Settings rows already answer
 * "business", and eight more beneath them would bury everything else.
 *
 * An empty query lists the first `limit` — what the popover shows on opening.
 */
export function searchSettings(
    query: string,
    actor: SettingsActor,
    { limit = 8, byPage = true }: { limit?: number; byPage?: boolean } = {},
): SettingsHit[] {
    const pages = new Map(
        settingsPagesFor(actor).map((page) => [page.href, page.label]),
    );
    const needle = query.trim().toLowerCase();
    const hits: SettingsHit[] = [];
    for (const entry of SETTINGS_INDEX) {
        const where = pages.get(entry.page);
        if (where === undefined) continue;
        if (entry.action && !holds(actor, entry.action)) continue;
        // An actor we cannot judge holds everything, so of a pair they are
        // offered the first half — never both, never neither.
        if (entry.unless && holds(actor, entry.unless)) continue;
        const found =
            !needle ||
            entry.label.toLowerCase().includes(needle) ||
            (byPage && where.toLowerCase().includes(needle));
        if (!found) continue;
        hits.push({
            label: entry.label,
            where,
            href: settingsEntryHref(entry),
        });
        if (hits.length === limit) break;
    }
    return hits;
}

/** Is this the settings screen, where the header's search is for settings? */
export function isSettingsScreen(pathname: string): boolean {
    return SETTINGS_PAGES.some(
        (page) =>
            pathname === page.href || pathname.startsWith(`${page.href}/`),
    );
}

/** A tab named in the URL, if it is one of `keys`; else `fallback`. */
export function tabFromParam<K extends string>(
    value: string | null | undefined,
    keys: readonly K[],
    fallback: K,
): K {
    return keys.find((key) => key === value) ?? fallback;
}
