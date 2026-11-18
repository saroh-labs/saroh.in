/**
 * The Website area's one map (plan 2026-11-18-001 U3, RULES §3): Overview,
 * then four groups and what each holds. The desk's section list, the
 * phone's site home, the heading over each screen and the switcher all read
 * it, so they can't disagree about where a thing lives.
 *
 * A screen not built yet links to where that capability lives today (Look
 * and colours in the editor, Your own web address in Settings › Address,
 * Teammates in the business's Team), so nothing is lost before its batch.
 * One with no home today (Photos and files, Customers who sign in, From
 * your business) is left out until it is built (RULES §5), never drawn
 * as working. Code shows only on a site built from code: none yet (batch 10).
 */

export type SiteGroupId =
    "pages-and-posts" | "look" | "reach" | "people-and-settings";

export type SiteSectionId =
    | "pages"
    | "writing"
    | "forms"
    | "look"
    | "logo"
    | "links"
    | "address"
    | "social"
    | "teammates"
    | "settings";

export interface SiteSection {
    id: SiteSectionId;
    label: string;
    href: string;
    /** Opens outside the site area: the editor or the business's settings. */
    leaves?: boolean;
}

export interface SiteGroup {
    id: SiteGroupId;
    label: string;
    sections: SiteSection[];
}

/** What this person may reach, as the site and their role say. */
export interface SiteAccess {
    /** `site.can.edit`: author screens, or only the reading ones. */
    canEdit: boolean;
    /** `form:read`: entries hold people's details (#385). */
    mayReadForms: boolean;
    /** `org:settings:read`: the business's logo lives there. */
    mayBusiness: boolean;
    /** `member:read`: the business's Team. */
    mayTeam: boolean;
}

/** Settings' in-page groups that now belong to Reach (`?section=`). */
const SETTINGS_IN_REACH: Partial<Record<string, SiteSectionId>> = {
    address: "address",
    "search-and-sharing": "links",
    contact: "social",
};

/**
 * `form:read`, which not everyone who can open the site holds (#385): by
 * what the role was given, else Owner and Admin, as the Forms tab decides.
 */
export function mayReadForms(
    organization: {
        role?: string | null;
        actions?: readonly string[] | null;
    } | null,
): boolean {
    return organization?.actions
        ? organization.actions.includes("form:read")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

export const overviewHref = (siteId: string) => `/sites/${siteId}/overview`;

export function siteGroups(siteId: string, access: SiteAccess): SiteGroup[] {
    const base = `/sites/${siteId}`;
    const settings = (section: string) => `${base}/settings?section=${section}`;
    const author = access.canEdit;
    const groups: SiteGroup[] = [
        {
            id: "pages-and-posts",
            label: "Pages and posts",
            sections: [
                // A reader reads pages in the editor, read-only (DEC-200):
                // the header's Open editor is their way in.
                ...(author
                    ? [
                          {
                              id: "pages" as const,
                              label: "Pages",
                              href: `${base}/pages`,
                          },
                      ]
                    : []),
                {
                    id: "writing",
                    label: "Blog and other writing",
                    href: `${base}/writing`,
                },
                ...(access.mayReadForms
                    ? [
                          {
                              id: "forms" as const,
                              label: "Forms",
                              href: `${base}/forms`,
                          },
                      ]
                    : []),
            ],
        },
        {
            id: "look",
            label: "Look",
            sections: author
                ? [
                      // The Brand panel lives in the editor until batch 5.
                      {
                          id: "look",
                          label: "Look and colours",
                          href: base,
                          leaves: true,
                      },
                      ...(access.mayBusiness
                          ? [
                                {
                                    id: "logo" as const,
                                    label: "Logo",
                                    href: "/settings/organization",
                                    leaves: true,
                                },
                            ]
                          : []),
                  ]
                : [],
        },
        {
            id: "reach",
            label: "Reach",
            sections: author
                ? [
                      {
                          id: "links",
                          label: "Links and sharing",
                          href: settings("search-and-sharing"),
                      },
                      {
                          id: "address",
                          label: "Your own web address",
                          href: settings("address"),
                      },
                      {
                          id: "social",
                          label: "Social",
                          href: settings("contact"),
                      },
                  ]
                : [],
        },
        {
            id: "people-and-settings",
            label: "People and settings",
            sections: [
                ...(access.mayTeam
                    ? [
                          {
                              id: "teammates" as const,
                              label: "Teammates",
                              href: "/settings/people",
                              leaves: true,
                          },
                      ]
                    : []),
                ...(author
                    ? [
                          {
                              id: "settings" as const,
                              label: "Settings",
                              href: `${base}/settings`,
                          },
                      ]
                    : []),
            ],
        },
    ];
    // A group with nothing this person may open is not drawn.
    return groups.filter((g) => g.sections.length > 0);
}

/**
 * Where `pathname` (plus its query) sits in the map: Overview, a section in
 * its group, or nowhere (a post, a version: places a section leads to).
 */
export function currentSection(
    groups: readonly SiteGroup[],
    siteId: string,
    pathname: string,
    search: URLSearchParams,
): { group: SiteGroupId | null; section: SiteSectionId | "overview" | null } {
    const base = `/sites/${siteId}`;
    if (pathname === `${base}/overview`) {
        return { group: null, section: "overview" };
    }
    const rest = pathname.startsWith(`${base}/`)
        ? pathname.slice(base.length + 1).split("/")[0]
        : "";
    let id: SiteSectionId | null = null;
    if (rest === "settings") {
        id = SETTINGS_IN_REACH[search.get("section") ?? ""] ?? "settings";
    } else if (rest === "pages" || rest === "writing" || rest === "forms") {
        id = rest;
    } else if (rest === "posts") {
        id = "writing";
    }
    for (const g of groups) {
        if (g.sections.some((s) => s.id === id)) {
            return { group: g.id, section: id };
        }
    }
    return { group: null, section: null };
}

/** The screens a switch to another site keeps you on. */
const KEPT = ["overview", "pages", "writing", "forms", "settings"];

/**
 * The same screen on another site (`/sites/a/pages` → `/sites/b/pages`).
 * One that belongs to this site alone (a post, a form, a version) lands on
 * the other site's Overview. Settings keeps its open group.
 */
export function switchHref(
    pathname: string,
    search: string,
    fromId: string,
    toId: string,
): string {
    const prefix = `/sites/${fromId}/`;
    const parts = pathname.startsWith(prefix)
        ? pathname.slice(prefix.length).split("/")
        : [];
    const [first] = parts;
    if (!first || !KEPT.includes(first)) return overviewHref(toId);
    if (parts.length > 1) return `/sites/${toId}/${first}`;
    const query =
        first === "settings" && search ? `?${search.replace(/^\?/, "")}` : "";
    return `/sites/${toId}/${first}${query}`;
}
