import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Blocks,
    Briefcase,
    Building2,
    CalendarClock,
    Globe,
    Home,
    KanbanSquare,
    Plug,
    Store,
    Target,
    Users,
} from "lucide-react";

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * `AppSidebar`, the mobile `MobileNav` drawer and the command menu, so the three
 * can never drift. Home is an ungrouped anchor.
 *
 * Only routes that exist today are listed — no speculative destinations. The
 * proposed IA in `docs/product-transformation/information-architecture.md` §2
 * names sub-pages (Orders, Collections, Branding, Segments…) that have not been
 * built; listing them here would put 404s in the rail, which is the defect
 * `scripts/check-app-routes.mjs` now fails the build over.
 */
/**
 * The roles the API knows, and what each may REACH in the navigation.
 *
 * A mirror of `organization-policy.ts`, and deliberately a small one: it
 * decides what to OFFER, never what is allowed. Every destination still
 * authorizes itself on the server, and a role that reaches one by typing its
 * address is refused exactly as before. This is the difference between a rail
 * that describes the workspace someone has and one that advertises a workspace
 * they do not — a REVIEWER invited to check one website was being offered
 * Notifications, Organization, People, Modules and Providers, all of which
 * answer "you do not have access to this" (#313).
 *
 * Only the actions the NAV needs are listed. Adding a destination that a role
 * cannot open means adding its action here; leaving `action` off means every
 * role may reach it, which is right for Home and for the module-gated
 * destinations — those are already filtered by availability, which the API
 * computes per actor.
 */
export type NavRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";

export type NavAction =
    | "site:read"
    | "site:create"
    | "section:write"
    | "member:read"
    | "module:read"
    | "notification:read"
    | "org:settings:read"
    | "provider:read";

/**
 * Role → what it may reach here.
 *
 * OWNER and ADMIN reach everything in this list; the two narrower roles are
 * enumerated, exactly as the policy enumerates them. MEMBER is the read-only
 * floor: the org, its roster and its modules, and every site. REVIEWER is
 * narrower rather than beneath it (#276) — one website, and nothing about the
 * business around it.
 */
const REACHABLE: Record<NavRole, readonly NavAction[]> = {
    OWNER: [
        "site:read",
        "site:create",
        "section:write",
        "member:read",
        "module:read",
        "notification:read",
        "org:settings:read",
        "provider:read",
    ],
    ADMIN: [
        "site:read",
        "site:create",
        "section:write",
        "member:read",
        "module:read",
        "notification:read",
        "org:settings:read",
        "provider:read",
    ],
    MEMBER: ["site:read", "member:read", "module:read"],
    REVIEWER: ["site:read"],
};

/**
 * May this role reach something that needs `action`?
 *
 * A null role is "we do not know yet" and fails OPEN, the same convention
 * `filterNavGroups` uses for unknown module availability: a chrome that empties
 * itself on a failed read is worse than one that offers a destination the
 * server then refuses.
 */
export function navRoleCan(role: NavRole | null, action: NavAction): boolean {
    if (role === null) return true;
    return REACHABLE[role].includes(action);
}

/**
 * A row nested under a destination — one of the merchant's OWN things.
 *
 * No icon: a child is identified by its name, and a column of identical globes
 * under Website would be decoration standing in for a distinction that does not
 * exist. `create` marks the row that makes a new one, which is drawn quietly
 * and always sits last.
 */
export interface NavChild {
    /** What the actor must be able to do to reach it; see {@link navRoleCan}. */
    action?: NavAction;
    /**
     * Absent for a row that only NAMES something — a site whose real
     * destinations are the rows beneath it. A label row is not a link, so
     * two children cannot both claim to be "the site" and the current-page
     * marker lands on the one screen the merchant is actually on.
     */
    href?: string;
    label: string;
    create?: boolean;
    /** One level further: what a site holds — its content and its settings. */
    children?: NavChild[];
}

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    /** What the actor must be able to do to reach it; see {@link navRoleCan}. */
    action?: NavAction;
    /**
     * The merchant's own things beneath this destination (their sites, today).
     *
     * Dynamic, so it is injected by {@link navGroupsWithSites} rather than
     * written into `NAV_GROUPS` — but it travels through the same structure the
     * sidebar, the drawer and the command menu all read, which is the whole
     * point of this file. A tree that existed only in the sidebar would be a
     * fourth navigation to keep in step.
     */
    children?: NavChild[];
    /**
     * The capability this destination belongs to (ADR-003).
     *
     * Gating moved from the group to the item when the rail was regrouped by
     * PURPOSE rather than by module: "Run the business" holds Commerce,
     * Appointments and CRM destinations at once, so one key per group can no
     * longer describe it. A group with no surviving items is dropped whole, so
     * a merchant never meets an empty heading.
     */
    moduleKey?: string;
}

export interface NavGroup {
    /** Uppercase group label; omitted for the ungrouped Home anchor. */
    label?: string;
    /**
     * The capability module this group belongs to (ADR-003). When set, the
     * group is shown only if that module is available for the actor; when
     * omitted, the group is always shown (core navigation).
     */
    moduleKey?: string;
    /**
     * Set the group off from the ones above it with a rule.
     *
     * This used to be `pinToBottom`, and `mt-auto` really did glue Settings to
     * the foot of a full-height rail. With twelve destinations that left a
     * vertical hole in the middle of the navigation big enough to read as a
     * rendering fault — the rail looked broken rather than organised. A hairline
     * says "configuration is a different kind of thing" in two pixels instead of
     * two hundred, and Settings is still always last, which is what muscle
     * memory actually keys on.
     */
    separated?: boolean;
    items: NavItem[];
}

/**
 * A heading earns its line when it says something the item does not.
 *
 * This used to also require two or more items, and that was right while groups
 * were named after MODULES: "COMMERCE" above a lone "Commerce" is the same word
 * twice, and "WEBSITE" above "Sites" spent a line to say less than the item
 * already did.
 *
 * Regrouping by PURPOSE inverts it. "Presence" above "Website" and "Grow" above
 * "Insights" both add the thing the item cannot say — why it is here and what
 * it sits beside. Worse, suppressing them does not merely lose a heading: the
 * orphaned item is read under whichever heading precedes it, so a hidden "Grow"
 * filed Insights under "Run the business", which is a different claim about
 * what Insights is for.
 */
export function showsGroupLabel(group: NavGroup): boolean {
    return Boolean(group.label);
}

/**
 * Navigation, named for what the merchant came to do.
 *
 * Onboarding asks "What does your business need to do?" and the merchant answers
 * in outcomes — *Sell products*, *Take appointments*, *Show up online*. The shell
 * then discarded that vocabulary entirely and handed back module and entity
 * names — Commerce, Sites, Analytics — that nobody chose and nothing taught.
 * These labels are the onboarding answer, carried forward.
 *
 * Presentation only. No route, module key or schema changes: the same
 * capability gating applies, and every URL is untouched.
 *
 * Commerce leads, per the product decision of 2026-08-02 and
 * `information-architecture.md` §2 — Sell sits above Bookings.
 *
 * `Contacts` deliberately keeps its name. The unified customer record is not
 * built yet (SEC-005 / ARCH-001 are open), so calling it "All customers" would
 * promise a merge that has not happened — the same over-claim that was removed
 * from the marketing site.
 */
export const NAV_GROUPS: NavGroup[] = [
    { items: [{ href: "/", label: "Home", icon: Home }] },
    {
        // Grouped by PURPOSE rather than by module, following the canvas
        // design. A merchant does not think "Commerce" and "Appointments" —
        // they think "the public face of my business" and "the work of running
        // it". §6: the architecture may stay modular; the interface should not
        // make the merchant think in modules.
        label: "Presence",
        items: [
            {
                href: "/sites",
                label: "Website",
                icon: Globe,
                moduleKey: "WEBSITE",
            },
        ],
    },
    {
        label: "Run the business",
        items: [
            {
                href: "/commerce",
                label: "Sell",
                icon: Store,
                moduleKey: "COMMERCE",
            },
            // Two destinations, two questions: "what is booked?" and "what can
            // be booked?". They lost their own BOOKINGS heading in the regroup;
            // the ordering keeps them adjacent so the pair still reads as one
            // idea.
            {
                href: "/bookings",
                label: "Schedule",
                icon: CalendarClock,
                moduleKey: "APPOINTMENTS",
            },
            {
                href: "/services",
                label: "Services",
                icon: Briefcase,
                moduleKey: "APPOINTMENTS",
            },
            {
                href: "/contacts",
                label: "Contacts",
                icon: Users,
                moduleKey: "CRM",
            },
            {
                href: "/leads",
                label: "Leads",
                icon: Target,
                moduleKey: "CRM",
            },
            {
                href: "/pipeline",
                label: "Pipeline",
                icon: KanbanSquare,
                moduleKey: "CRM",
            },
        ],
    },
    {
        label: "Grow",
        items: [
            {
                href: "/analytics",
                label: "Insights",
                icon: BarChart3,
                moduleKey: "INSIGHTS",
            },
        ],
        // The canvas design also shows Marketing, Automation and AI here as
        // SOON. The rail deliberately has no "coming soon" state: a nav entry
        // that cannot be opened spends a permanent line advertising absence,
        // and §2 asks that what the UI claims match what ships. A capability
        // appears here when it has a route.
    },
    {
        label: "Workspace",
        separated: true,
        items: [
            /*
             * Never module-gated — Settings → Modules is where a capability
             * gets turned on in the first place, so gating it on a module would
             * be a door locked from the inside.
             *
             * ROLE-gated, though, and it was not. The note here used to say
             * these "degrade by role on the server, so showing them to every
             * actor leaks nothing", and three of the five do exactly that:
             * Notifications, Organization and People answer "you do not have
             * access to this". Offering a destination whose only content is a
             * refusal is not degrading gracefully, it is sending someone down a
             * corridor to a locked door. Providers did not even refuse — it
             * named the payment and messaging providers the business runs on to
             * anyone who was not a MEMBER, REVIEWER included (#313).
             */
            {
                href: "/notifications",
                label: "Notifications",
                icon: Bell,
                action: "notification:read",
            },
            {
                href: "/settings/organization",
                label: "Organization",
                icon: Building2,
                action: "org:settings:read",
            },
            {
                href: "/settings/people",
                label: "People",
                icon: Users,
                action: "member:read",
            },
            {
                href: "/settings/modules",
                label: "Modules",
                icon: Blocks,
                action: "module:read",
            },
            {
                href: "/settings/providers",
                label: "Providers",
                icon: Plug,
                action: "provider:read",
            },
        ],
    },
];

/**
 * Project the nav to what an actor may see, given the module keys currently
 * available to them (a module is "available" when every capability gate passes,
 * i.e. its effective readiness is not DISABLED).
 *
 * Fail-open is reserved for genuine uncertainty. `null` means we could not find
 * out what is available (the modules fetch failed, or rollout flags are still
 * off) — the full nav is shown so the app is never emptied. An empty ARRAY is
 * different: it means we asked and the answer is "nothing is enabled yet", which
 * is the normal state of a brand-new Organization. Showing that merchant fifteen
 * destinations for capabilities they have not turned on advertises a workspace
 * they do not have, so we show only the always-on groups and let onboarding do
 * its job. Groups without a `moduleKey` (Home, Notifications) are always kept.
 */
/** The Website destination, the one that grows a tree today. */
const WEBSITE_HREF = "/sites";

/**
 * Hang the merchant's own sites under Website.
 *
 * Reaching a site used to cost four steps from anywhere else in the workspace —
 * rail, then the sites list, then a card, then the editor. A merchant works on
 * one or two sites all day, so the thing they open most often was the thing
 * furthest down. Their sites are the closest thing this product has to the
 * spaces a project tool puts in its rail, and they belong there for the same
 * reason: the rail should list what you have, not only what the software does.
 *
 * PAGES ARE NOT NESTED, deliberately. A page list means fetching every site's
 * detail on every render of the shell — this runs on every screen in the app —
 * and one round trip per site to save one click inside a site the merchant has
 * already opened is the wrong trade. The editor's own Pages tab is where that
 * belongs.
 *
 * Returns the groups untouched when there is nothing to hang, so a merchant
 * with no sites sees exactly what they saw before plus a way to make one.
 */
export function navGroupsWithSites(
    groups: readonly NavGroup[],
    sites: readonly { id: string; name: string }[],
    role: NavRole | null = null,
): NavGroup[] {
    /*
     * What a site holds depends on what this person came to do with it.
     *
     * Someone who may author it gets the three places the work happens. Someone
     * who may only read it gets the screen built for reading — `/sites/:id`
     * redirects them there anyway, so "Pages" was a label for a page they never
     * saw. Settings is left out of the reading tree for the same reason it is
     * not a dead link: it opens, and then says they cannot change anything. A
     * rail that lists it promises otherwise.
     */
    const mayAuthor = navRoleCan(role, "section:write");
    const rowsFor = (siteId: string): NavChild[] =>
        mayAuthor
            ? [
                  // Pages is the editor — the route that has no rail of its
                  // own — Posts is its writing (ADR-004), and Settings is
                  // address, search, share card, menu and footer.
                  { href: `${WEBSITE_HREF}/${siteId}`, label: "Pages" },
                  { href: `${WEBSITE_HREF}/${siteId}/posts`, label: "Posts" },
                  {
                      href: `${WEBSITE_HREF}/${siteId}/settings`,
                      label: "Settings",
                  },
              ]
            : [
                  { href: `${WEBSITE_HREF}/${siteId}/review`, label: "Review" },
                  { href: `${WEBSITE_HREF}/${siteId}/posts`, label: "Posts" },
              ];

    return groups.map((group) => ({
        ...group,
        items: group.items.map((item) => {
            if (item.href !== WEBSITE_HREF) return item;
            return {
                ...item,
                children: [
                    ...sites.map((site) => ({
                        // The site row names the site; the rows beneath it are
                        // where it can be taken.
                        label: site.name.trim() || "Untitled site",
                        children: rowsFor(site.id),
                    })),
                    // Last, and marked: creating is a different kind of act
                    // from opening, and putting it in the tree is what saves a
                    // merchant going to the list page to find the button. Only
                    // for a role that may actually make one.
                    ...(navRoleCan(role, "site:create")
                        ? [
                              {
                                  href: `${WEBSITE_HREF}/new`,
                                  label: "New site",
                                  create: true,
                              },
                          ]
                        : []),
                ],
            };
        }),
    }));
}

export function filterNavGroups(
    groups: readonly NavGroup[],
    availableModuleKeys: readonly string[] | null,
): NavGroup[] {
    if (availableModuleKeys === null) return [...groups];
    const available = new Set(availableModuleKeys);
    const allowed = (key?: string) => !key || available.has(key);

    return (
        groups
            .filter((group) => allowed(group.moduleKey))
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => allowed(item.moduleKey)),
            }))
            // A heading with nothing under it is worse than no heading: it names a
            // capability the merchant does not have and then shows them nothing.
            .filter((group) => group.items.length > 0)
    );
}

/**
 * Drop the destinations this role cannot open.
 *
 * Separate from module availability because they answer different questions —
 * "does this business have this capability" and "may this person use it" — and
 * a merchant meets both. A group emptied by either is dropped whole, for the
 * same reason: a heading over nothing names something the reader does not have.
 */
export function filterNavGroupsByRole(
    groups: readonly NavGroup[],
    role: NavRole | null,
): NavGroup[] {
    if (role === null) return [...groups];
    return groups
        .map((group) => ({
            ...group,
            items: group.items
                .filter((item) => !item.action || navRoleCan(role, item.action))
                .map((item) =>
                    item.children === undefined
                        ? item
                        : {
                              ...item,
                              children: item.children.filter(
                                  (child) =>
                                      !child.action ||
                                      navRoleCan(role, child.action),
                              ),
                          },
                ),
        }))
        .filter((group) => group.items.length > 0);
}

/**
 * The navigation one actor should see: their sites, their capabilities, their
 * role.
 *
 * One function because the rail, the drawer and the command palette must agree.
 * They each composed the same two calls by hand, which is three chances to
 * forget the third — and when role gating arrived, three places to add it.
 */
export function navFor({
    role,
    moduleKeys,
    sites,
}: {
    /** `null` when it could not be resolved; the nav then fails open. */
    role: NavRole | null;
    /** `null` = availability unknown; see {@link filterNavGroups}. */
    moduleKeys: readonly string[] | null;
    sites: readonly { id: string; name: string }[];
}): NavGroup[] {
    return filterNavGroupsByRole(
        filterNavGroups(
            navGroupsWithSites(NAV_GROUPS, sites, role),
            moduleKeys,
        ),
        role,
    );
}

/**
 * Active-route match: exact for the Home root (so it isn't lit on every page),
 * prefix for everything else (so detail routes keep their parent highlighted).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The Notifications item carries a live unread badge; identify it by route. */
export const NOTIFICATIONS_HREF = "/notifications";

/**
 * Work waiting behind a destination, keyed by route.
 *
 * This is what turns the rail from a filing cabinet into a workspace: "Leads"
 * names a place, "Leads 4" names a job. The numbers come from the SAME Home
 * read model that ranks the actions, so the rail and Home can never disagree
 * about how much is outstanding — and a count only ever appears for a module
 * the actor can see, because the Home model already gates on availability.
 *
 * Deliberately sparse. A badge on every item is a badge on nothing; only routes
 * with something genuinely waiting get one.
 */
export type NavCounts = Readonly<Record<string, number | undefined>>;
