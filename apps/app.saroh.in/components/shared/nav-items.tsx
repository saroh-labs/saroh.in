import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Building2,
    Calendar,
    CalendarClock,
    CreditCard,
    Globe,
    Home,
    KanbanSquare,
    LayoutGrid,
    Link2,
    ReceiptText,
    SlidersHorizontal,
    Store,
    Target,
    UserRound,
    Users,
} from "lucide-react";

import { mayAddWebsite } from "@/lib/business-limits";

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * `AppSidebar`, the phone `TabBar` (and its sheet) and the command menu, so the
 * three can never drift. Home is an ungrouped anchor.
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
    // The business itself: Home › Calendar reads the month across every
    // module (the layers inside it gate themselves). Not a Reviewer's.
    | "org:read"
    | "site:read"
    | "site:create"
    | "section:write"
    | "member:read"
    | "module:read"
    | "notification:read"
    | "org:settings:read"
    | "provider:read"
    // The business-wide Orders list: customer names, emails and totals across
    // every storefront. Not in the read-only floor, so a Member or Reviewer
    // is not offered a row the API would refuse them.
    | "order:read"
    // Moving an order through the kitchen (DEC-024): a Member holds it, and
    // reaches the Orders list and an order's page through it — the kitchen's
    // view, without money.
    | "order:stage"
    // Leads and the pipeline (Owner and Admin by default; a Member reads
    // contacts, not the sales funnel).
    | "lead:read"
    | "pipeline:read"
    // The diary and the people on it: a Member holds these (DEC-020).
    | "contact:read"
    | "booking:read"
    | "service:read"
    // Sell → Discounts. Owner and Admin by default; money off is money.
    | "discount:read"
    // Products, Customers and Storefronts read storefront data. In the Member
    // floor, so nothing changes for the built-ins; it matters for a role the
    // business invented without it, which was offered three rows that each
    // answered it with a refusal.
    | "store:read"
    // Billing (Subscriptions, Invoices) and Schedule's Courses and Class
    // packs (ADR-007). Owner and Admin by default: who owes what is not in
    // the Member floor. Listed ahead of their rows so each unit that ships a
    // page only has to add the row.
    | "subscription:read"
    | "invoice:read"
    // "New invoice", "Subscribe someone", "New course", "New class pack"
    // and "Sell a pack" in the command menu make one.
    | "invoice:write"
    | "subscription:write"
    | "course:write"
    | "course:read"
    | "pack:read"
    | "pack:write";

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
        "org:read",
        "site:read",
        "site:create",
        "section:write",
        "member:read",
        "module:read",
        "notification:read",
        "org:settings:read",
        "provider:read",
        "order:read",
        "order:stage",
        "discount:read",
        "store:read",
        "subscription:read",
        "invoice:read",
        "course:read",
        "pack:read",
        "invoice:write",
        "subscription:write",
        "course:write",
        "pack:write",
        "lead:read",
        "pipeline:read",
    ],
    ADMIN: [
        "org:read",
        "site:read",
        "site:create",
        "section:write",
        "member:read",
        "module:read",
        "notification:read",
        "org:settings:read",
        "provider:read",
        "order:read",
        "order:stage",
        "discount:read",
        "store:read",
        "subscription:read",
        "invoice:read",
        "course:read",
        "pack:read",
        "invoice:write",
        "subscription:write",
        "course:write",
        "pack:write",
        "lead:read",
        "pipeline:read",
    ],
    MEMBER: [
        "org:read",
        "site:read",
        "member:read",
        "module:read",
        "store:read",
        "contact:read",
        "booking:read",
        "service:read",
        "order:stage",
    ],
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
export function navRoleCan(
    role: NavRole | null,
    action: NavAction | readonly NavAction[],
): boolean {
    if (role === null) return true;
    return anyOf(action).some((a) => REACHABLE[role].includes(a));
}

/** A destination some of whose actions reach it: any one will do. */
const anyOf = (action: NavAction | readonly NavAction[]) =>
    typeof action === "string" ? [action] : action;

/**
 * May this actor reach something that needs `action`?
 *
 * Prefers the permissions the API resolved for them, because a business can
 * invent roles and `REACHABLE` above only knows the four that ship — an
 * invented role would be judged by whichever built-in it happens to map to,
 * which is the floor, and its rail would be wrong in both directions.
 *
 * Every `NavAction` is a real `OrgAction`, deliberately: the rail asks the
 * same question the server answers, in the same words, so the two cannot mean
 * different things by "may see the roster".
 *
 * Falls back to the role map when permissions have not been loaded, and fails
 * OPEN on a null role — same convention as `filterNavGroups`. A chrome that
 * empties itself on a failed read is worse than one offering a destination the
 * server then refuses, because only one of those is recoverable by the person
 * looking at it.
 */
export function navCan(
    actor: { role: NavRole | null; actions?: readonly string[] | null },
    action: NavAction | readonly NavAction[],
): boolean {
    const { actions } = actor;
    if (actions) return anyOf(action).some((a) => actions.includes(a));
    return navRoleCan(actor.role, action);
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
    /** Any one of several will do, e.g. Orders: `order:read` or `order:stage`. */
    action?: NavAction | readonly NavAction[];
    /**
     * Withheld from an actor who holds `holds` but not `without`, whatever
     * `action` says. The API's rule for the store's customers: the kitchen's
     * roles — `order:stage` without `order:read` — reach the store but are
     * refused its customer list, which is emails and spend (R7, #508).
     */
    refusedTo?: { holds: NavAction; without: NavAction };
    /**
     * Absent for a row that only NAMES something — a site whose real
     * destinations are the rows beneath it. A label row is not a link, so
     * two children cannot both claim to be "the site" and the current-page
     * marker lands on the one screen the merchant is actually on.
     */
    href?: string;
    label: string;
    create?: boolean;
    /**
     * The capability this page belongs to, when its section spans more than
     * one — Bookings holds Appointments pages and Courses. Filtered exactly
     * like {@link NavItem.moduleKey}.
     */
    moduleKey?: string;
    /** One level further: what a site holds — its content and its settings. */
    children?: NavChild[];
}

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    /** What the actor must be able to do to reach it; see {@link navRoleCan}. */
    action?: NavAction | readonly NavAction[];
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
     * Rule the group off and pin it to the foot of the rail.
     *
     * It was pinned once before, then only ruled, because the gap above it
     * read as a rendering fault on a rail with twelve destinations. It is
     * pinned again by choice (2026-09-25): Workspace sits at the bottom, where
     * account-level things live, apart from running the business. The space
     * above it is a flexible spacer, never less than the old 10px, so a rail
     * too long for the window scrolls with the rule still in place.
     */
    pinToBottom?: boolean;
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
    {
        items: [
            { href: "/", label: "Home", icon: Home },
            // Home › Calendar: one month of everything dated, after the
            // "Saroh Business Calendar" design. Not module-gated — it spans
            // modules, and each layer on it follows its own module and
            // permission (the API leaves out what the viewer may not see).
            {
                href: "/calendar",
                label: "Calendar",
                icon: Calendar,
                action: "org:read",
            },
        ],
    },
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
                // Sell's screens are destinations, so they nest in the rail
                // (brand file §13): Sell is the section, the child is the page.
                //
                // Orders leads, and Storefronts closes. The order is the
                // design's and it is the order of a working day: the thing
                // waiting for you first, the things you keep, and the places
                // you sell from last — a merchant opens Storefronts to change
                // a setting, not to find out what needs doing.
                children: [
                    {
                        href: "/commerce/orders",
                        label: "Orders",
                        // A Member at the counter reaches it through the
                        // kitchen (DEC-024) and sees no money on it.
                        action: ["order:read", "order:stage"],
                    },
                    {
                        href: "/commerce/products",
                        label: "Products",
                        action: "store:read",
                    },
                    {
                        href: "/commerce/customers",
                        label: "Customers",
                        action: "store:read",
                        // Emails and spend: not the counter's (R7, #508).
                        refusedTo: {
                            holds: "order:stage",
                            without: "order:read",
                        },
                    },
                    {
                        href: "/commerce/discounts",
                        label: "Discounts",
                        action: "discount:read",
                    },
                    {
                        href: "/commerce/storefronts",
                        // Singular: a business has one for now (ADR-006).
                        label: "Storefront",
                        action: "store:read",
                    },
                ],
            },
            // Bookings: "what is booked?" and "what can be booked?" as one
            // section, after the "Saroh Bookings" design. They used to be four
            // rows of their own (Schedule, Services, Courses, Class packs);
            // the design nests them, as Sell nests its screens. Every address
            // is unchanged — the section is presentation only.
            //
            // No `moduleKey` on the section itself: Courses is its own module
            // (ADR-007), so a business may run courses without taking
            // appointments. Each child carries its own key; a section whose
            // every child is filtered away is dropped whole, and one whose
            // landing page was filtered away lands on its first survivor
            // (see `landOnFirstChild`).
            {
                href: "/bookings",
                label: "Bookings",
                icon: CalendarClock,
                children: [
                    {
                        href: "/bookings",
                        label: "Calendar",
                        moduleKey: "APPOINTMENTS",
                    },
                    {
                        href: "/services",
                        label: "Services",
                        moduleKey: "APPOINTMENTS",
                    },
                    // Who can be booked when, and the business's rules (U16).
                    {
                        href: "/bookings/availability",
                        label: "Availability",
                        moduleKey: "APPOINTMENTS",
                    },
                    {
                        href: "/courses",
                        label: "Courses",
                        moduleKey: "COURSES",
                        action: "course:read",
                    },
                    // Booked time sold ahead (ADR-007).
                    {
                        href: "/class-packs",
                        label: "Class packs",
                        moduleKey: "APPOINTMENTS",
                        action: "pack:read",
                    },
                ],
            },
            // Payments (ADR-007): money a business is owed by a person —
            // memberships and the invoices for them, after the "Saroh Billing
            // and Classes" design. The rail says Payments; the addresses stay
            // `/billing/*`, which is where the old Billing links still land.
            {
                // The section, like Sell's `/commerce`: every Payments page is
                // under it, so the rail opens and marks Payments on any of
                // them. `/billing` itself redirects to Subscriptions.
                href: "/billing",
                label: "Payments",
                icon: ReceiptText,
                moduleKey: "PAYMENTS",
                children: [
                    {
                        href: "/billing/subscriptions",
                        label: "Subscriptions",
                        action: "subscription:read",
                    },
                    {
                        href: "/billing/invoices",
                        label: "Invoices",
                        action: "invoice:read",
                    },
                    // Not in the design's section, but a plan is what a
                    // subscription is made from and it has no other path.
                    {
                        href: "/billing/plans",
                        label: "Plans",
                        action: "subscription:read",
                    },
                ],
            },
            {
                href: "/contacts",
                label: "Contacts",
                icon: Users,
                moduleKey: "CRM",
            },
            // Contacts is reached with the CRM module (`contact:read`, which a
            // Member holds); leads and the pipeline need `lead:read` and
            // `pipeline:read`, which a Member does not.
            {
                href: "/leads",
                label: "Leads",
                icon: Target,
                moduleKey: "CRM",
                action: "lead:read",
            },
            {
                href: "/pipeline",
                label: "Pipeline",
                icon: KanbanSquare,
                moduleKey: "CRM",
                action: "pipeline:read",
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
        pinToBottom: true,
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
            /*
             * One Settings row (2026-09-25). Its pages are tabs on the
             * settings screen itself (`SETTINGS_PAGES`), so the rail does not
             * repeat them. Offered when the actor may open one of the
             * business's pages; `/settings` then opens the first they may.
             * Your profile is everyone's, but it is about the person, so it
             * does not put Settings in a Reviewer's rail — they reach it from
             * the account menu, as the design has it. Plan and billing needs
             * `org:settings:read`, already listed. Notifications moved to the
             * top bar (`NOTIFICATIONS_NAV`).
             */
            {
                href: "/settings",
                label: "Settings",
                icon: SlidersHorizontal,
                action: [
                    "org:settings:read",
                    "member:read",
                    "module:read",
                    "provider:read",
                ],
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
export const WEBSITE_HREF = "/sites";

/**
 * Hang the merchant's own sites under Website — for the command palette.
 *
 * The RAIL no longer draws this tree (the workspace design keeps Website to one
 * row, and the Website screen's picker and tabs say which site and where in
 * it). The palette still does: typing a site's name and landing on its posts
 * is the one-step jump the tree used to be, without a tree to scroll past.
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
                  // Pages lists them, the editor is where they are worked on
                  // — the route that has no rail of its own — Posts is its
                  // writing (ADR-004), and Settings is address, search, share
                  // card, menu and footer.
                  { href: `${WEBSITE_HREF}/${siteId}/pages`, label: "Pages" },
                  { href: `${WEBSITE_HREF}/${siteId}`, label: "Editor" },
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
                    // for a role that may actually make one, and only while
                    // the business has no website yet (ADR-006).
                    ...(navRoleCan(role, "site:create") &&
                    mayAddWebsite(sites.length)
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

/**
 * Which rail rows a module owns.
 *
 * Modules is the screen where a merchant decides what their workspace
 * contains, so it has to say what each switch actually does — and the honest
 * answer is here, in the nav itself, rather than in a hand-written sentence
 * per module that drifts the first time a row moves.
 */
export function navRowsForModule(moduleKey: string): string[] {
    const rows: string[] = [];
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            const own = item.moduleKey ?? group.moduleKey;
            // A section's screens count as rows: turning Commerce off takes
            // Storefronts, Products and Customers with it, and the merchant
            // should be told the names they navigate by. A section that spans
            // modules (Bookings) names the ones this module owns.
            const children = (item.children ?? []).filter(
                (child) => (child.moduleKey ?? own) === moduleKey,
            );
            if (own !== moduleKey && children.length === 0) continue;
            if (own === moduleKey) rows.push(item.label);
            for (const child of children) {
                // A child that repeats its parent's destination AND name is
                // the section landing page, not a second row.
                if (child.href === item.href && child.label === item.label) {
                    continue;
                }
                rows.push(child.label);
            }
        }
    }
    return rows;
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
                items: group.items.flatMap((item) => {
                    if (!allowed(item.moduleKey)) return [];
                    if (!item.children?.some((c) => c.moduleKey)) {
                        return [item];
                    }
                    const children = item.children.filter((child) =>
                        allowed(child.moduleKey),
                    );
                    // A section every page of which belongs to a module
                    // this business does not have is not offered at all.
                    if (children.length === 0) return [];
                    return [landOnFirstChild(item, children)];
                }),
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
    /** The API-resolved permissions; preferred over `role` when present. */
    actions?: readonly string[] | null,
): NavGroup[] {
    if (role === null && !actions) return [...groups];
    const actor = { role, actions };
    return groups
        .map((group) => ({
            ...group,
            items: group.items.flatMap((item) => {
                if (item.action && !navCan(actor, item.action)) return [];
                if (item.children === undefined) return [item];
                const children = item.children.filter(
                    (child) =>
                        (!child.action || navCan(actor, child.action)) &&
                        !refuses(actor, child.refusedTo),
                );
                // A section whose every page is refused is not offered as an
                // empty heading. Only a section that HAD pages: Website with
                // no sites yet is still a destination in its own right.
                if (item.children.length > 0 && children.length === 0) {
                    return [];
                }
                return [landOnFirstChild(item, children)];
            }),
        }))
        .filter((group) => group.items.length > 0);
}

/**
 * Does a child's {@link NavChild.refusedTo} withhold it from this actor?
 * Fails open like {@link navCan}: an actor we cannot judge holds `without`
 * too, so nothing is withheld.
 */
function refuses(
    actor: { role: NavRole | null; actions?: readonly string[] | null },
    rule: NavChild["refusedTo"],
): boolean {
    if (!rule) return false;
    return navCan(actor, rule.holds) && !navCan(actor, rule.without);
}

/**
 * A section with its children narrowed, still landing somewhere real.
 *
 * Bookings lands on its Calendar, which is also its first child. A business
 * with Courses but not Appointments keeps the section for Courses — and a
 * section row that still pointed at `/bookings` would open a capability it
 * does not have. So when the child that WAS the landing page is gone, the
 * section lands on the first page left. A section whose address is a page of
 * its own (Sell's `/commerce`) keeps it.
 */
function landOnFirstChild(item: NavItem, children: NavChild[]): NavItem {
    const landedOnChild = item.children?.some((c) => c.href === item.href);
    const stillThere = children.some((c) => c.href === item.href);
    const first = children.find((c) => c.href)?.href;
    if (landedOnChild && !stillThere && first) {
        return { ...item, href: first, children };
    }
    return { ...item, children };
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
    actions,
    moduleKeys,
    sites,
}: {
    /** `null` when it could not be resolved; the nav then fails open. */
    role: NavRole | null;
    /**
     * What the actor may do, as the API resolved it. Preferred over `role`,
     * which cannot describe a role the business invented.
     */
    actions?: readonly string[] | null;
    /** `null` = availability unknown; see {@link filterNavGroups}. */
    moduleKeys: readonly string[] | null;
    /**
     * The merchant's sites, hung under Website for the command palette. The
     * rail and the drawer leave it out: Website is one row there.
     */
    sites?: readonly { id: string; name: string }[];
}): NavGroup[] {
    return filterNavGroupsByRole(
        filterNavGroups(
            sites ? navGroupsWithSites(NAV_GROUPS, sites, role) : NAV_GROUPS,
            moduleKeys,
        ),
        role,
        actions,
    );
}

/**
 * Active-route match: exact for the Home root (so it isn't lit on every page),
 * prefix for everything else (so detail routes keep their parent highlighted).
 */
/**
 * Whether a child row is the page you are on: its own address, or anything
 * beneath it — a product's page is still Products. A segment boundary, not a
 * bare prefix, so `/sites/new` never lights a sibling that starts the same.
 */
export function isNavChildCurrent(
    pathname: string,
    /** A label row has none, and is never the page you are on. */
    href: string | undefined,
    /** The rows beside it: the deepest match wins, so only one lights. */
    siblings: readonly { href?: string }[] = [],
): boolean {
    const under = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
    if (!href || !under(href)) return false;
    return !siblings.some(
        (s) => s.href && s.href.length > href.length && under(s.href),
    );
}

/**
 * Pages that belong to a section without living under its address. Customer
 * Detail (`/customers/:contactId`, U18) is rooted on the contact, so it is
 * Sell › Customers where the business sells and Contacts where it does not:
 * the first of its homes the actor's rail holds is where the rail says you
 * are. Every other address is its own.
 */
const NAV_HOMES: readonly { prefix: string; homes: readonly string[] }[] = [
    { prefix: "/customers/", homes: ["/commerce/customers", "/contacts"] },
];

export function navPathname(
    pathname: string,
    groups: readonly NavGroup[],
): string {
    const entry = NAV_HOMES.find((e) => pathname.startsWith(e.prefix));
    if (!entry) return pathname;
    const hrefs = new Set(
        groups.flatMap((g) =>
            g.items.flatMap((i) => [
                i.href,
                ...(i.children ?? []).map((c) => c.href),
            ]),
        ),
    );
    return entry.homes.find((h) => hrefs.has(h)) ?? pathname;
}

export function isNavItemActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Is this row — or, for a section, any page in it — where you are?
 *
 * A section's pages need not live under its own address: Bookings is
 * `/bookings`, and its Services and Courses are `/services` and `/courses`.
 * Matching the section's address alone left the rail dark on half of it.
 */
export function isNavSectionActive(
    pathname: string,
    item: Pick<NavItem, "href" | "children">,
): boolean {
    return (
        isNavItemActive(pathname, item.href) ||
        (item.children ?? []).some((child) =>
            isNavChildCurrent(pathname, child.href),
        )
    );
}

/**
 * One settings tab. `action` is what the actor must hold to open it; left off,
 * everyone signed in may (Your profile is about the person, not the
 * business). `ownerOnly` narrows it further to the business's owner, by role:
 * a plan and its invoices are the owner's to see, as the design has it.
 */
export interface SettingsPage {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    action?: NavAction;
    ownerOnly?: true;
}

/**
 * The settings screen's tabs, in the design's order (2026-09-25): the
 * business, who is on it, what it runs, what Saroh costs it, you, and the
 * services behind it. The settings layout draws them as vertical tabs and the
 * command menu lists them, each only for an actor who may open it.
 */
export const SETTINGS_PAGES = [
    {
        href: "/settings/organization",
        label: "Business",
        description: "Name, address and the details on receipts",
        icon: Building2,
        action: "org:settings:read",
    },
    {
        href: "/settings/people",
        label: "Team",
        description: "Who works here and what each role opens",
        icon: Users,
        action: "member:read",
    },
    {
        href: "/settings/modules",
        label: "Modules",
        description: "What this business runs on",
        icon: LayoutGrid,
        action: "module:read",
    },
    {
        href: "/settings/billing",
        label: "Plan and billing",
        description: "What Saroh costs and your invoices",
        icon: CreditCard,
        action: "org:settings:read",
        ownerOnly: true,
    },
    {
        href: "/settings/profile",
        label: "Your profile",
        description: "Your login and the alerts you get",
        icon: UserRound,
    },
    {
        href: "/settings/providers",
        label: "Providers",
        description: "Hosting, email and payments behind it",
        icon: Link2,
        action: "provider:read",
    },
] as const satisfies readonly SettingsPage[];

/**
 * May this actor open this settings page?
 *
 * The action as `navCan` judges it, and for an owner-only page the role too.
 * A null role is "we do not know yet" and fails open, as everywhere in the
 * nav: the page itself still refuses anyone who is not the owner.
 */
export function mayOpenSettingsPage(
    actor: { role: NavRole | null; actions?: readonly string[] | null },
    page: SettingsPage,
): boolean {
    if (page.action && !navCan(actor, page.action)) return false;
    if (page.ownerOnly && actor.role !== null && actor.role !== "OWNER") {
        return false;
    }
    return true;
}

/** The settings pages this actor may open, in tab order. */
export function settingsPagesFor(actor: {
    role: NavRole | null;
    actions?: readonly string[] | null;
}) {
    return SETTINGS_PAGES.filter((page) => mayOpenSettingsPage(actor, page));
}

/** The Notifications item carries a live unread badge; identify it by route. */
export const NOTIFICATIONS_HREF = "/notifications";

/**
 * Notifications lives in the top bar, not the rail (2026-09-25): it is about
 * you, not a part of the business. The bell and the command menu both read
 * it here, with the same permission the rail used.
 */
export const NOTIFICATIONS_NAV = {
    href: NOTIFICATIONS_HREF,
    label: "Notifications",
    icon: Bell,
    action: "notification:read",
} as const satisfies Pick<NavItem, "href" | "label" | "icon" | "action">;

/**
 * What is waiting behind one destination: unread for Notifications, the Home
 * read model's count for anything else. The rail, the tab bar and its sheet
 * all read it here, so they cannot count differently.
 */
export function navCountFor(
    href: string | undefined,
    counts: NavCounts | undefined,
    unread: number,
): number {
    if (!href) return 0;
    if (href === NOTIFICATIONS_HREF) return unread;
    return counts?.[href] ?? 0;
}

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
