import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    Building2,
    Calendar,
    CalendarClock,
    Clock,
    ConciergeBell,
    CreditCard,
    Download,
    Globe,
    GraduationCap,
    Home,
    Layers,
    LayoutGrid,
    Link2,
    MapPin,
    Megaphone,
    Package,
    Plug,
    QrCode,
    ReceiptText,
    Repeat,
    ShoppingBag,
    SlidersHorizontal,
    Tag,
    Target,
    Ticket,
    UserRound,
    Users,
} from "lucide-react";

import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { mayAddWebsite } from "@/lib/business-limits";
import { kindOf } from "@/lib/organizations/kind";
import { isLocationScopedRole } from "@/lib/organizations/storefront-team";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";

/** Online › Social: Your posts and Create post, while Share is switched on (DEC-217). */
export const SOCIAL_HREF = "/social";

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
    // The alerts addressed to the person alone (DEC-170, #1038): a Member
    // has the bell for these, never the business's inbox.
    | "notification:read-own"
    | "org:settings:read"
    | "provider:read"
    // Settings › Activity: who changed what. Owner and Admin, as the API
    // keeps the audit stream.
    | "audit:read"
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
    | "pack:sell"
    | "pack:write"
    // "New service" and "New location" in the command menu make one too:
    // the API asks these of the write, so the palette asks them of the row.
    | "service:write"
    | "store:create"
    // The command menu's daily starts (10 Oct 2026): New order, New
    // booking, New product, New customer and New discount code, each
    // asked the permission the API asks of that write.
    | "order:create"
    | "booking:write"
    | "store:write"
    | "contact:write"
    | "discount:write"
    // Settings › Plan and billing: what Saroh costs the business and its
    // invoices. Owner and Admin by default, as the API has it; changing the
    // plan is `billing:manage`, the Owner's alone, which the page asks
    // (`plan-access.ts`).
    | "billing:read"
    // Grow › Social (Create post, #1378): seeing and sharing posts. Owner and
    // Admin by default, grantable to Members (the Social group in Roles).
    | "social:read";

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
        "notification:read-own",
        "org:settings:read",
        "provider:read",
        "audit:read",
        "order:read",
        "order:stage",
        "discount:read",
        "store:read",
        // Sell › Customers (matrix W-1, B16).
        "contact:read",
        "subscription:read",
        "invoice:read",
        "course:read",
        "pack:read",
        "invoice:write",
        "subscription:write",
        "course:write",
        "pack:sell",
        "pack:write",
        "service:write",
        "store:create",
        "order:create",
        "booking:write",
        "store:write",
        "contact:write",
        "discount:write",
        "lead:read",
        "pipeline:read",
        "billing:read",
        "social:read",
    ],
    ADMIN: [
        "org:read",
        "site:read",
        "site:create",
        "section:write",
        "member:read",
        "module:read",
        "notification:read",
        "notification:read-own",
        "org:settings:read",
        "provider:read",
        "audit:read",
        "order:read",
        "order:stage",
        "discount:read",
        "store:read",
        // Sell › Customers (matrix W-1, B16).
        "contact:read",
        "subscription:read",
        "invoice:read",
        "course:read",
        "pack:read",
        "invoice:write",
        "subscription:write",
        "course:write",
        "pack:sell",
        "pack:write",
        "service:write",
        "store:create",
        "order:create",
        "booking:write",
        "store:write",
        "contact:write",
        "discount:write",
        "lead:read",
        "pipeline:read",
        "billing:read",
        "social:read",
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
        // Their own alerts: the answer to a request they made (#1038).
        "notification:read-own",
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
     * Offered only while the business tracks stock (#527): Sell › Stock
     * has nothing to show when every product sells without a count.
     */
    whenTracking?: boolean;
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
    /** The phone's bottom tab says this instead (owner, 23 Nov). */
    shortLabel?: string;
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
     * Gating is on the item, not the group: a group holds destinations of
     * several modules (What you offer has Products, Services and Courses).
     * A group with no surviving items is dropped whole, so a merchant never
     * meets an empty heading.
     */
    moduleKey?: string;
    /**
     * Offered only while this module is NOT available: a row that stands
     * in for a page the module otherwise holds. Invoices need no module
     * (DEC-070), and sit under Payments while it's on; with it off they
     * get this row of their own. While availability is unknown the module's
     * own section is shown, so this row isn't.
     */
    unlessModule?: string;
    /**
     * Offered while ANY of these modules is available (or availability is
     * unknown): Customers, for a business that takes money in any way
     * (DEC-264).
     */
    anyModule?: readonly string[];
    /** Offered only while the business tracks stock (#527): Stock. */
    whenTracking?: boolean;
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
     * pinned again by choice (2026-09-25): Manage sits at the bottom, where
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
 * Grouping by the merchant's question (DEC-262) inverts it. "Online" above
 * "Website" adds the thing the item cannot say — why it is here and what it
 * sits beside. Worse, suppressing a heading does not merely lose it: the
 * orphaned item is read under whichever heading precedes it. "Insights" over
 * Insights alone repeats the word, and is kept for the same reason.
 */
export function showsGroupLabel(group: NavGroup): boolean {
    return Boolean(group.label);
}

/**
 * Navigation, grouped by the question the merchant is asking (DEC-262,
 * 26 Nov 2026): what needs me today, who are they, who paid, what do I
 * offer, how do people find me, how is it going, and what did I set once.
 *
 * One home per thing: every destination is one row in one group, whatever
 * module built it, and daily work comes before setup. The groups used to
 * be modules wearing purpose names ("Run the business" held Sell, Bookings
 * and Payments as sections), so Orders sat beside Location and Bookings
 * beside Hours and time off, and a gym with Sell off had no customer list.
 *
 * The same menu for every business: rows leave it only by the gates that
 * already existed (module, role, plan, edition, switch). Grouping by trade
 * is deferred by the owner (26 Nov 2026).
 *
 * Presentation only. No route moved: every address is the one it was, and
 * each row keeps the gates it had as a section's page.
 *
 * `Contacts` deliberately keeps its name. The unified customer record is not
 * built yet (SEC-005 / ARCH-001 are open), so calling it "All customers" would
 * promise a merge that has not happened.
 */
const STOREFRONTS_HREF = "/commerce/locations";
const STOCK_HREF = "/commerce/stock";
const INVOICES_HREF = "/billing/invoices";
const CUSTOMERS_HREF = "/commerce/customers";
const LEADS_HREF = "/leads";
const PIPELINE_HREF = "/pipeline";
/** Plans are a tab of Memberships (D3); the menu names them on their own. */
export const MEMBERSHIP_PLANS_HREF = "/billing/subscriptions?tab=plans";

/**
 * The modules a business takes money with (DEC-264): with any of them on,
 * People › Customers is offered, Sell or not. The list itself is the
 * business's contacts who paid (DEC-041), served by the API to
 * `contact:read` whatever modules are on.
 */
export const PAYING_MODULES = [
    "COMMERCE",
    "PAYMENTS",
    "APPOINTMENTS",
    "COURSES",
    "CLASS_PACKS",
] as const;

export const NAV_GROUPS: NavGroup[] = [
    {
        label: "Today",
        items: [
            { href: "/", label: "Home", icon: Home },
            // One month of everything dated (DEC-170). Not module-gated —
            // it spans modules, and each layer on it follows its own module
            // and permission (the API leaves out what the viewer may not see).
            {
                href: "/calendar",
                label: "Business calendar",
                shortLabel: "Calendar",
                icon: Calendar,
                action: "org:read",
            },
            {
                href: "/commerce/orders",
                label: "Orders",
                icon: ShoppingBag,
                moduleKey: "COMMERCE",
                // A Member at the counter reaches it through the kitchen
                // (DEC-024) and sees no money on it.
                action: ["order:read", "order:stage"],
            },
            {
                href: "/bookings",
                label: "Bookings",
                icon: CalendarClock,
                moduleKey: "APPOINTMENTS",
            },
        ],
    },
    {
        label: "People",
        items: [
            {
                href: CUSTOMERS_HREF,
                label: "Customers",
                icon: UserRound,
                // Its own read (matrix W-1, B16): the business's contacts
                // who paid (DEC-041), served to `contact:read`; the order
                // columns in it follow `order:read` there.
                action: "contact:read",
                anyModule: PAYING_MODULES,
            },
            // Leads and the pipeline need `lead:read` and `pipeline:read`,
            // which a Member does not hold. Pipeline is Leads' board view
            // (`LeadsViewSwitch`), so it is not a row of its own: whoever
            // holds only `pipeline:read` lands on the board (`navFor`).
            {
                href: LEADS_HREF,
                label: "Leads",
                icon: Target,
                moduleKey: "CRM",
                action: ["lead:read", "pipeline:read"],
            },
            // Reached with the CRM module (`contact:read`, which a Member
            // holds). It stays until People is one list with views.
            {
                href: "/contacts",
                label: "Contacts",
                icon: Users,
                moduleKey: "CRM",
            },
        ],
    },
    {
        label: "Money",
        items: [
            // Invoices need no module (DEC-070, KTD-11). Two entries for one
            // row so it keeps exactly the gates it had: the first while
            // Payments is on (or unknown), the second while it is off, which
            // a site for my work doesn't get (`withoutStandaloneInvoices`).
            {
                href: INVOICES_HREF,
                label: "Invoices",
                icon: ReceiptText,
                moduleKey: "PAYMENTS",
                action: "invoice:read",
            },
            {
                href: INVOICES_HREF,
                label: "Invoices",
                icon: ReceiptText,
                action: "invoice:read",
                unlessModule: "PAYMENTS",
            },
            // The people paying monthly. The menu and the page's heading
            // say Memberships; the columns and emails still say
            // Subscriptions until the owner decides the word (DEC-264).
            {
                href: "/billing/subscriptions",
                label: "Memberships",
                icon: CreditCard,
                moduleKey: "PAYMENTS",
                action: "subscription:read",
            },
        ],
    },
    {
        label: "What you offer",
        items: [
            {
                href: "/commerce/products",
                label: "Products",
                icon: Package,
                moduleKey: "COMMERCE",
                action: "store:read",
            },
            {
                // Levels, the log and the checks (#527). Reading stock is
                // reading the catalogue.
                href: STOCK_HREF,
                label: "Stock",
                icon: Layers,
                moduleKey: "COMMERCE",
                action: "store:read",
                whenTracking: true,
            },
            {
                href: "/services",
                label: "Services",
                icon: ConciergeBell,
                moduleKey: "APPOINTMENTS",
            },
            {
                href: "/courses",
                label: "Courses",
                icon: GraduationCap,
                moduleKey: "COURSES",
                action: "course:read",
            },
            // Booked time sold ahead (ADR-007): its own module, which needs
            // Appointments (E12).
            {
                href: "/class-packs",
                label: "Class packs",
                icon: Ticket,
                moduleKey: "CLASS_PACKS",
                action: "pack:read",
            },
            {
                href: MEMBERSHIP_PLANS_HREF,
                label: "Membership plans",
                icon: Repeat,
                moduleKey: "PAYMENTS",
                action: "subscription:read",
            },
            {
                href: "/commerce/discounts",
                label: "Discount codes",
                icon: Tag,
                moduleKey: "COMMERCE",
                action: "discount:read",
            },
        ],
    },
    {
        label: "Online",
        items: [
            {
                href: "/sites",
                label: "Website",
                icon: Globe,
                moduleKey: "WEBSITE",
            },
            // Social (#1378, DEC-217): Your posts, then Create post. Website
            // until the Social module exists, as the API gates it.
            {
                href: SOCIAL_HREF,
                label: "Social",
                icon: Megaphone,
                moduleKey: "WEBSITE",
                action: "social:read",
            },
        ],
    },
    {
        label: "Insights",
        items: [
            {
                href: "/analytics",
                label: "Insights",
                icon: BarChart3,
                moduleKey: "INSIGHTS",
            },
        ],
    },
    {
        // Things set once, at the foot of the rail (DEC-262; "Manage" from
        // DEC-133 until then). The space above it is a flexible spacer.
        label: "Setup",
        pinToBottom: true,
        items: [
            {
                href: STOREFRONTS_HREF,
                // Singular for the business with one; `navFor` names it
                // "Locations" once there are more (DEC-069).
                label: "Location",
                icon: MapPin,
                moduleKey: "COMMERCE",
                action: "store:read",
            },
            // Who can be booked when, and the business's rules (U16).
            {
                href: "/bookings/availability",
                label: "Hours and time off",
                icon: Clock,
                moduleKey: "APPOINTMENTS",
            },
            /*
             * Never module-gated: Settings › Modules is where a capability
             * gets turned on, so gating it on a module would be a door
             * locked from the inside. Role-gated (#313): offered when the
             * actor may open one of the business's pages (`SETTINGS_PAGES`,
             * its tabs); `/settings` then opens the first they may. Your
             * profile is reached from the account menu.
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
    /**
     * The permissions the API resolved for this person. A role the business
     * made is judged by what was ticked for it, never by the built-in it maps
     * to: one ticked `site:create` is offered "New site", and one without it
     * is not offered a row that ends in a refusal.
     */
    actions: readonly string[] | null = null,
    /** The Website area switch, as the api said (DEC-240). */
    websiteArea = false,
): NavGroup[] {
    const actor = { role, actions };
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
    const mayAuthor = navCan(actor, "section:write");
    // The Website area's Overview first while it is on (plan 2026-11-18-001).
    const overview = (siteId: string): NavChild[] =>
        websiteArea
            ? [
                  {
                      href: `${WEBSITE_HREF}/${siteId}/overview`,
                      label: "Overview",
                  },
              ]
            : [];
    const rowsFor = (siteId: string): NavChild[] => [
        ...overview(siteId),
        ...(mayAuthor
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
                  // A Reviewer reviews in the editor, read-only (DEC-200).
                  { href: `${WEBSITE_HREF}/${siteId}`, label: "Review" },
                  { href: `${WEBSITE_HREF}/${siteId}/posts`, label: "Posts" },
              ]),
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
                    ...(navCan(actor, "site:create") &&
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
    // A page that keeps a row of its own while the module is off (Invoices,
    // DEC-070) doesn't go with it.
    const staying = new Set(
        NAV_GROUPS.flatMap((g) => g.items)
            .filter((i) => i.unlessModule === moduleKey)
            .map((i) => i.href),
    );
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            const own = item.moduleKey ?? group.moduleKey;
            // The merchant is told the names they navigate by: turning
            // Commerce off takes Orders, Products, Stock, Discount codes and
            // Location with it. A section's screens (a site's, in the
            // palette) count as rows too.
            const children = (item.children ?? []).filter(
                (child) =>
                    (child.moduleKey ?? own) === moduleKey &&
                    !(child.href && staying.has(child.href)),
            );
            if (own !== moduleKey && children.length === 0) continue;
            if (own === moduleKey && !staying.has(item.href)) {
                rows.push(item.label);
            }
            for (const child of children) {
                // A child that repeats its parent's destination AND name is
                // the section landing page, not a second row, when the
                // section itself is already named. Bookings' diary row is
                // named for its section, which spans modules and isn't.
                if (
                    own === moduleKey &&
                    child.href === item.href &&
                    child.label === item.label
                ) {
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
    if (availableModuleKeys === null) {
        // Unknown: every module's own rows are shown, so a row standing in
        // for one of them while it is off is not.
        return groups.map((group) => ({
            ...group,
            items: group.items.filter((item) => !item.unlessModule),
        }));
    }
    const available = new Set(availableModuleKeys);
    const allowed = (key?: string) => !key || available.has(key);

    return (
        groups
            .filter((group) => allowed(group.moduleKey))
            .map((group) => ({
                ...group,
                items: group.items.flatMap((item) => {
                    if (!allowed(item.moduleKey)) return [];
                    if (
                        item.anyModule &&
                        !item.anyModule.some((k) => available.has(k))
                    ) {
                        return [];
                    }
                    if (item.unlessModule && available.has(item.unlessModule)) {
                        return [];
                    }
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
                    (child) => !child.action || navCan(actor, child.action),
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
 * A section with its children narrowed, still landing somewhere real.
 *
 * Bookings lands on its diary, which is also its first child. A business
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
    roleKey,
    actions,
    moduleKeys,
    sites,
    storefronts,
    stockTracked,
    kind,
    websiteArea,
}: {
    /** `null` when it could not be resolved; the nav then fails open. */
    role: NavRole | null;
    /**
     * The role as stored. A Storefront team holder (DEC-074) is offered
     * Sell with Orders alone: their storefront's orders are their work.
     */
    roleKey?: string | null;
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
    /**
     * How many storefronts the business has; with more than one the row
     * reads "Locations" (ADR-010, DEC-069). `null` or absent keeps the singular.
     */
    storefronts?: number | null;
    /**
     * The business's Track stock switch (#515). Off, Sell › Stock is not
     * offered; `null` or absent (unknown) fails open.
     */
    stockTracked?: boolean | null;
    /**
     * What is being set up (DEC-070). A site for my work bills nobody to
     * begin with, so Invoices isn't a rail row of its own (UX-074): it is
     * under Payments once that is on, and reached from Settings › Your
     * details › Tax and invoices and the command menu (which passes no
     * kind). Absent: every row, as for a business.
     */
    kind?: unknown;
    /** The Website area switch (DEC-240): its sites' Overview row. */
    websiteArea?: boolean;
}): NavGroup[] {
    const tracked = filterNavGroupsByRole(
        filterNavGroups(
            sites
                ? navGroupsWithSites(
                      NAV_GROUPS,
                      sites,
                      role,
                      actions,
                      websiteArea,
                  )
                : NAV_GROUPS,
            moduleKeys,
        ),
        role,
        actions,
    );
    const shared = sharePostsOn() ? tracked : withoutSocial(tracked);
    const stocked = stockTracked === false ? withoutStockRows(shared) : shared;
    const billed =
        kindOf(kind) === "WORK" ? withoutStandaloneInvoices(stocked) : stocked;
    const groups = isLocationScopedRole(roleKey)
        ? sellOrdersOnly(billed)
        : billed;
    const named = (storefronts ?? 0) > 1 ? pluralStorefronts(groups) : groups;
    return navCan({ role, actions }, "lead:read")
        ? named
        : leadsOnTheBoard(named);
}

/**
 * Leads for someone who reads the pipeline but not the list: the row lands
 * on its board view, as the Pipeline row it replaced did.
 */
function leadsOnTheBoard(groups: NavGroup[]): NavGroup[] {
    return groups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
            item.href === LEADS_HREF ? { ...item, href: PIPELINE_HREF } : item,
        ),
    }));
}

/** What was Sell's: a location's team is offered its Orders alone. */
const SELL_ROWS_BUT_ORDERS = new Set([
    "/commerce/products",
    STOCK_HREF,
    CUSTOMERS_HREF,
    "/commerce/discounts",
    STOREFRONTS_HREF,
]);

/**
 * A location's team (DEC-074): of what was Sell, Orders alone. The
 * storefronts, products and stock their role can read stay reachable by
 * address; the rail offers the work.
 */
function sellOrdersOnly(groups: NavGroup[]): NavGroup[] {
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) => !SELL_ROWS_BUT_ORDERS.has(item.href),
            ),
        }))
        .filter((group) => group.items.length > 0);
}

/** The Invoices row that stands in while Payments is off, taken out. */
function withoutStandaloneInvoices(groups: NavGroup[]): NavGroup[] {
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) => !(item.href === INVOICES_HREF && item.unlessModule),
            ),
        }))
        .filter((group) => group.items.length > 0);
}

/** The Social row taken out while Share is switched off (DEC-217). */
function withoutSocial(groups: NavGroup[]): NavGroup[] {
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => item.href !== SOCIAL_HREF),
        }))
        .filter((group) => group.items.length > 0);
}

/** The rows that need the business to track stock, taken out. */
function withoutStockRows(groups: NavGroup[]): NavGroup[] {
    return groups
        .map((group) => ({
            ...group,
            items: group.items
                .filter((item) => !item.whenTracking)
                .map((item) =>
                    item.children
                        ? {
                              ...item,
                              children: item.children.filter(
                                  (c) => !c.whenTracking,
                              ),
                          }
                        : item,
                ),
        }))
        .filter((group) => group.items.length > 0);
}

/** The Location row, named for a business that has several. */
function pluralStorefronts(groups: NavGroup[]): NavGroup[] {
    const rename = <T extends { href?: string; label: string }>(row: T): T =>
        row.href === STOREFRONTS_HREF ? { ...row, label: "Locations" } : row;
    return groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
            ...rename(item),
            children: item.children?.map(rename),
        })),
    }));
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
 * Pages that belong to a row without living under its address. The person
 * page (`/contacts/:contactId`, #869) is Contacts' or Customers': the one
 * the person came from when they came from either (`from`), else the first
 * of them the actor's rail holds. Leads' board (`/pipeline`) is Leads'
 * (DEC-262). A plan's pages (`/billing/plans/:planId`) are Membership
 * plans'. Every other address is its own.
 */
const NAV_HOMES: readonly { prefix: string; homes: readonly string[] }[] = [
    { prefix: "/contacts/", homes: ["/contacts", CUSTOMERS_HREF] },
    { prefix: PIPELINE_HREF, homes: [LEADS_HREF, PIPELINE_HREF] },
    {
        prefix: "/billing/plans/",
        homes: [MEMBERSHIP_PLANS_HREF, "/billing/subscriptions"],
    },
];

/** Is `pathname` this address or a page beneath it? */
const isUnder = (pathname: string, href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

/**
 * The address the rail marks for `pathname`.
 *
 * `from` is the last page the person was on before it (`useNavPathname`):
 * a person opened from Customers keeps Customers lit, and from Contacts,
 * Contacts.
 */
export function navPathname(
    pathname: string,
    groups: readonly NavGroup[],
    from: string | null = null,
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
    const came = from
        ? entry.homes.find((h) => hrefs.has(h) && isUnder(from, h))
        : undefined;
    return came ?? entry.homes.find((h) => hrefs.has(h)) ?? pathname;
}

/** Whether `pathname` is one of the pages `navPathname` gives a home. */
export function hasNavHome(pathname: string): boolean {
    return NAV_HOMES.some((e) => pathname.startsWith(e.prefix));
}

export function isNavItemActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Is this row — or, for a section, any page in it — where you are?
 *
 * `rows` are the rail's other rows: the deepest match wins, so on Hours
 * and time off (`/bookings/availability`) Bookings is not lit too, and on
 * Membership plans Memberships isn't.
 */
export function isNavSectionActive(
    pathname: string,
    item: Pick<NavItem, "href" | "children">,
    rows: readonly Pick<NavItem, "href">[] = [],
): boolean {
    const deeper = rows.some(
        (r) =>
            r.href.length > item.href.length &&
            r.href.startsWith(item.href) &&
            isNavItemActive(pathname, r.href),
    );
    return (
        (isNavItemActive(pathname, item.href) && !deeper) ||
        (item.children ?? []).some((child) =>
            isNavChildCurrent(pathname, child.href),
        )
    );
}

/** The rail row `pathname` (already through `navPathname`) is under, if any. */
export function activeNavItem(
    pathname: string,
    groups: readonly NavGroup[],
): NavItem | undefined {
    const rows = groups.flatMap((g) => g.items);
    return rows.find((item) => isNavSectionActive(pathname, item, rows));
}

/** Settings › Plan and billing, hidden while plans aren't shown. */
const PLAN_PAGE_HREF = "/settings/billing";
const API_AREA_HREF = "/settings/developers";

/**
 * One settings tab. `action` is what the actor must hold to open it; left off,
 * everyone signed in may (Your profile is about the person, not the
 * business). `ownerOnly` narrows it further to the business's owner, by role,
 * where the API does too ("Your data", DEC-120). Plan and billing is not one
 * of those: the API reads it to `billing:read`, which an Admin holds, and
 * the tab follows the API (10 Oct 2026).
 */
export interface SettingsPage {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    action?: NavAction;
    ownerOnly?: true;
    /** Offered to every role but the Reviewer, who holds no part of the business. */
    notForReviewer?: true;
    /**
     * Also opened, without `action`, where this switch is on for the
     * person (Providers holds their own Google Calendar, 20 Nov 2026). Only
     * the settings layout reads `switches`: the command menu and search go
     * by `action` alone.
     */
    orSwitch?: "google-calendar";
}

/**
 * The settings screen's tabs, in the design's order (2026-09-25): the
 * business, who is on it, what it runs, what Saroh costs it, you, what
 * it hands customers to scan (Share, 2026-10-10: after Your profile, so
 * `/settings` still opens Your profile for someone who reaches nothing else
 * of the business's), who changed what, and the services behind it. The settings layout draws them as vertical tabs and the
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
        action: "billing:read",
    },
    {
        href: "/settings/profile",
        label: "Your profile",
        description: "Your sign-in and the alerts you get",
        icon: UserRound,
    },
    {
        href: "/settings/share",
        label: "Share",
        description: "QR codes for the counter and your cards",
        icon: QrCode,
        // Whoever may see the website may see its codes; making and
        // changing one is `site:update`, which the page and the API judge.
        action: "site:read",
    },
    {
        href: "/settings/activity",
        label: "Activity",
        description: "Who changed what, and when",
        icon: Clock,
        // The design gates it on reading settings; the API keeps the audit
        // stream to Owner and Admin, so the tab follows the API.
        action: "audit:read",
    },
    {
        href: "/settings/integrations",
        label: "Integrations",
        description: "Payments, email, domains and your calendar",
        icon: Link2,
        action: "provider:read",
        // A person's own Google Calendar is here too (#1047, DEC-233),
        // behind GOOGLE_CALENDAR, which the layout asks the API about.
        orSwitch: "google-calendar",
    },
    {
        // Every member connects their own AI assistant (plan 2026-11-10-001,
        // R9); keys and webhooks inside ask `apikey:manage` and
        // `webhook:manage`. Not a Reviewer's (owner, v1).
        href: "/settings/developers",
        label: "API and AI apps",
        description: "AI assistants, keys and notifications",
        icon: Plug,
        notForReviewer: true,
    },
    {
        // "Download your data" (DEC-120): the owner's alone, by role, as
        // the API has it. Last, after everything the business runs on.
        href: "/settings/data",
        label: "Your data",
        description: "Download everything as one file",
        icon: Download,
        action: "org:settings:read",
        ownerOnly: true,
    },
] as const satisfies readonly SettingsPage[];

/**
 * May this actor open this settings page?
 *
 * The action as `navCan` judges it, and for an owner-only page the role too.
 * A null role is "we do not know yet" and fails open, as everywhere in the
 * nav: the page itself still refuses anyone who is not the owner.
 *
 * Plan and billing is nobody's while plans aren't shown (DEC-136): the
 * tabs, `/settings`, the command menu and Settings search all ask here, so
 * it leaves them together, and its address is a 404. On an edition Saroh
 * doesn't bill (Global, DEC-211) it stays, holding only the Free note
 * (`freeNoteShown`).
 */
export function mayOpenSettingsPage(
    actor: {
        role: NavRole | null;
        actions?: readonly string[] | null;
        switches?: readonly string[];
    },
    page: SettingsPage,
): boolean {
    if (page.href === PLAN_PAGE_HREF && !plansShown() && !freeNoteShown()) {
        return false;
    }
    const switchedOn = page.orSwitch && actor.switches?.includes(page.orSwitch);
    if (page.action && !switchedOn && !navCan(actor, page.action)) return false;
    if (page.ownerOnly && actor.role !== null && actor.role !== "OWNER") {
        return false;
    }
    if (page.notForReviewer && actor.role === "REVIEWER") return false;
    // Ask AI's tab opens the area too, for whoever may switch it (U11).
    if (
        page.href === API_AREA_HREF &&
        !apiAreaOn() &&
        !(askAiOn() && actor.actions?.includes("module:manage"))
    ) {
        return false;
    }
    return true;
}

/** The settings pages this actor may open, in tab order. */
export function settingsPagesFor(actor: {
    role: NavRole | null;
    actions?: readonly string[] | null;
    switches?: readonly string[];
}) {
    return SETTINGS_PAGES.filter((page) => mayOpenSettingsPage(actor, page));
}

/** The Notifications item carries a live unread badge; identify it by route. */
export const NOTIFICATIONS_HREF = "/notifications";

/**
 * Notifications lives in the top bar, not the rail (2026-09-25): it is about
 * you, not a part of the business. The bell and the command menu both read
 * it here. Either permission opens it (DEC-170, #1038): owners and admins
 * read the business's notices and their own, a Member only their own —
 * the API decides which rows each sees.
 */
export const NOTIFICATIONS_NAV = {
    href: NOTIFICATIONS_HREF,
    label: "Notifications",
    icon: Bell,
    action: ["notification:read", "notification:read-own"],
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
