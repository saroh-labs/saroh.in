import type { NavRole } from "@/components/shared/nav-items";
import {
    SETTINGS_PAGES,
    settingsPagesFor,
} from "@/components/shared/nav-items";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/organizations/business-types";
import { KIND_CHOICES, kindWords } from "@/lib/organizations/kind";

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

/**
 * A settings page's name in the words of what is being set up (DEC-070,
 * K5): Business is "Your details" for Just me and A site for my work. The
 * rest keep their names.
 */
export function settingsPageLabel(
    page: { href: string; label: string },
    kind: unknown,
): string {
    return page.href === "/settings/organization"
        ? kindWords(kind).settingsTab
        : page.label;
}

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
    /**
     * Other words that find it: the choices the setting offers, so "LLP"
     * lands on the type of business.
     */
    words?: readonly string[];
    /**
     * The module the setting belongs to. Offered only while this person
     * has it here: never for one Saroh hasn't rolled out (DEC-057), nor
     * one that is off.
     */
    module?: string;
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
 * billing, Your profile, Activity, Providers.
 */
export const SETTINGS_INDEX: readonly SettingsEntry[] = [
    business("Business name", "identity"),
    {
        ...business("What you're setting up", "identity"),
        // Each answer by its name, and what it is examples of (DEC-070).
        words: [
            ...KIND_CHOICES.map((c) => c.label),
            ...KIND_CHOICES.flatMap((c) =>
                c.examples.split(",").map((w) => w.trim()),
            ),
        ],
    },
    business("Logo", "identity"),
    business("Legal name", "identity"),
    {
        ...business("Type of business", "identity"),
        // Each type by its name, and Pvt Ltd as it is usually written.
        words: [
            ...BUSINESS_TYPE_OPTIONS.filter((o) => o.value).map((o) => o.label),
            "Pvt Ltd",
        ],
    },
    business("Time zone", "identity"),
    business("Trading since", "identity"),
    {
        ...business("Web address", "identity"),
        // The four addresses are named apart (DEC-069); the words it went
        // by before still find it.
        words: ["Workspace address", "Saroh address", "Subdomain", "saroh.app"],
    },
    business("Contact email", "contact"),
    business("Phone on your website", "contact"),
    business("Website", "contact"),
    business("GST registration", "tax"),
    business("GSTIN or tax ID", "tax"),
    business("Invoice prefix and numbers", "tax"),
    business("Invoice number format", "tax"),
    business("Financial year", "tax"),
    business("GST on delivery", "tax"),
    business("Delivery SAC", "tax"),
    business("Opening hours", "hours"),
    {
        ...business("How to pay us", "pay"),
        // What customers pay with when the business doesn't take payment
        // online (R32).
        words: ["UPI", "UPI ID", "QR", "Bank details", "IFSC", "Bank transfer"],
    },
    {
        ...business("Registered address", "address"),
        // The tab and its row were once a bare "Address"; it is the one
        // invoices print.
        words: ["Address on invoices"],
    },
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
    // Names no module: the ones Saroh hasn't rolled out aren't named (DEC-057).
    {
        label: "Modules — turn parts of Saroh on or off",
        page: "/settings/modules",
    },
    { label: "Contacts pipeline", page: "/settings/modules", module: "CRM" },
    { label: "Plan and billing", page: "/settings/billing" },
    { label: "Change plan", page: "/settings/billing" },
    { label: "Invoices from Saroh", page: "/settings/billing" },
    { label: "Your profile and password", page: "/settings/profile" },
    { label: "Alerts — the bell and email", page: "/settings/profile" },
    { label: "Activity — who changed what", page: "/settings/activity" },
    {
        label: "Providers — hosting, email, payments",
        page: "/settings/providers",
    },
    { label: "Email and WhatsApp sender", page: "/settings/providers" },
    { label: "Download your data", page: "/settings/data" },
    {
        label: "Payment provider",
        page: "/settings/providers",
        module: "PAYMENTS",
    },
];

export interface SettingsActor {
    role: NavRole | null;
    actions?: readonly string[] | null;
    /**
     * The modules this person has here (the rail's). `null` or absent is
     * unknown, and every setting is offered, as the rail fails open.
     */
    modules?: readonly string[] | null;
    /**
     * What is being set up (DEC-070), for the words a page is named in.
     * Absent reads as a business.
     */
    kind?: unknown;
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
 * A match is the words typed appearing in the setting's name or its other
 * `words` (a business type finds the type of business) — or, with
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
        settingsPagesFor(actor).map((page) => [
            page.href,
            settingsPageLabel(page, actor.kind),
        ]),
    );
    const needle = query.trim().toLowerCase();
    const hits: SettingsHit[] = [];
    for (const entry of SETTINGS_INDEX) {
        const where = pages.get(entry.page);
        if (where === undefined) continue;
        if (entry.action && !holds(actor, entry.action)) continue;
        if (
            entry.module &&
            actor.modules &&
            !actor.modules.includes(entry.module)
        ) {
            continue;
        }
        // An actor we cannot judge holds everything, so of a pair they are
        // offered the first half — never both, never neither.
        if (entry.unless && holds(actor, entry.unless)) continue;
        const found =
            !needle ||
            entry.label.toLowerCase().includes(needle) ||
            (entry.words ?? []).some((w) => w.toLowerCase().includes(needle)) ||
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
