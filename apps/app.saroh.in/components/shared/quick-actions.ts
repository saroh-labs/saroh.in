import type { LucideIcon } from "lucide-react";
import {
    CalendarCheck,
    CalendarPlus,
    Globe,
    GraduationCap,
    Package,
    ReceiptText,
    Repeat,
    ShoppingBag,
    Store,
    Tag,
    Ticket,
    UserPlus,
} from "lucide-react";

import { WHO_CAN_CHANGE } from "@/lib/access/who-can-change";
import type { StorefrontAllowance } from "@/lib/business-limits";
import { mayAddStorefront, mayAddWebsite } from "@/lib/business-limits";
import type { ModuleView } from "@/lib/modules/schema";
import { permits } from "@/lib/organizations/permits";

import type { NavAction, NavRole } from "./nav-items";
import { navCan } from "./nav-items";

/*
 * The command palette's quick actions, apart from the palette that draws
 * them, so which rows a role is offered can be tested without a browser
 * (`quick-actions.test.ts`).
 */

/**
 * Things you can DO, not just places you can go. Each is gated on the module
 * that owns it, so a merchant without Commerce is never offered "New store".
 *
 * ONLY ROUTES THAT EXIST. "New lead" belongs on this list by every argument
 * except the one that counts — there is no `/leads/new`; a lead is created from
 * a contact. Adding it would have rebuilt the exact defect this audit opened
 * with: a confident call to action that terminates in "Page not found".
 * `pnpm check:routes` fails the build on these, and it is checked here.
 */
/*
 * Quick actions. Every one of them MAKES something, so every one of them needs
 * a role that may: the palette was offering "New site" to a reviewer, whose
 * only powers are reading a site and saying what they think (#313).
 *
 * A module being on says only that the role READS it. "New service" and "New
 * location" were gated on the module alone, so a Member, a location's own
 * people and a calendar-only person were offered both and then refused. Every
 * row now names the permission the API asks of its write.
 */
export interface QuickAction {
    href: string;
    label: string;
    icon: LucideIcon;
    moduleKey?: string;
    /**
     * What the API asks of the write this row starts. Required: a row with
     * none was offered to every role and ended in a refusal
     * (`command-menu.test.tsx` checks every row has one).
     */
    action: NavAction | readonly NavAction[];
    /**
     * Offered only while the business may still make one: one website
     * (ADR-006), storefronts up to the plan (ADR-010).
     */
    limit?: "website" | "storefront";
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
    /*
     * The daily jobs first (10 Oct 2026): the menu could start a service,
     * a course or a site, and none of what a shop does forty times a day.
     * There is no "Take payment" here: it is taken on a booking or an
     * order, and has no page of its own to open.
     */
    {
        // The Orders list opens New order on arrival.
        href: "/commerce/orders?new=1",
        label: "New order",
        icon: ShoppingBag,
        moduleKey: "COMMERCE",
        action: "order:create",
    },
    {
        // The bookings calendar opens New booking on arrival.
        href: "/bookings?new=1",
        label: "New booking",
        icon: CalendarCheck,
        moduleKey: "APPOINTMENTS",
        action: "booking:write",
    },
    {
        href: "/commerce/products/new",
        label: "New product",
        icon: Package,
        moduleKey: "COMMERCE",
        action: "store:write",
    },
    {
        href: "/commerce/customers/new",
        label: "New customer",
        icon: UserPlus,
        // A customer is a contact (DEC-041): no module of its own.
        action: "contact:write",
    },
    {
        href: "/commerce/discounts/new",
        label: "New discount code",
        icon: Tag,
        moduleKey: "COMMERCE",
        action: "discount:write",
    },
    {
        href: "/services/new",
        label: "New service",
        icon: CalendarPlus,
        moduleKey: "APPOINTMENTS",
        // A Member and a calendar-only person read services, never make one.
        action: "service:write",
    },
    {
        href: "/courses/new",
        label: "New course",
        icon: GraduationCap,
        moduleKey: "COURSES",
        action: "course:write",
    },
    {
        href: "/class-packs/new",
        label: "New class pack",
        icon: Ticket,
        moduleKey: "CLASS_PACKS",
        action: "pack:write",
    },
    {
        href: "/class-packs?sell=1",
        label: "Sell a pack",
        icon: Ticket,
        moduleKey: "CLASS_PACKS",
        // `pack:sell` (E26); an API from before it asked `pack:write`.
        action: ["pack:sell", "pack:write"],
    },
    {
        href: "/sites/new",
        label: "New site",
        icon: Globe,
        moduleKey: "WEBSITE",
        action: "site:create",
        limit: "website",
    },
    {
        href: "/billing/subscriptions?subscribe=1",
        label: "Subscribe someone",
        icon: Repeat,
        moduleKey: "PAYMENTS",
        action: "subscription:write",
    },
    {
        href: "/billing/invoices/new",
        label: "New invoice",
        icon: ReceiptText,
        // Invoicing needs no module (DEC-070): only the permission.
        action: "invoice:write",
    },
    {
        href: "/commerce/locations/new",
        label: "New location",
        icon: Store,
        moduleKey: "COMMERCE",
        // `POST stores` asks `store:create`. A location's own people don't
        // hold it.
        action: "store:create",
        limit: "storefront",
    },
];

/**
 * The quick actions this person is offered: the module is on (or not yet
 * known), their permissions hold what the row's write asks, and the
 * business may still make one.
 */
export function quickActionsFor({
    moduleKeys,
    role,
    actions,
    siteCount,
    storefronts,
}: {
    /** The modules that are on, or null while that isn't known. */
    moduleKeys: readonly string[] | null;
    role: NavRole | null;
    /** The permissions the API resolved for this person. */
    actions: readonly string[] | null;
    siteCount: number;
    storefronts: StorefrontAllowance | null;
}): QuickAction[] {
    const available = moduleKeys === null ? null : new Set(moduleKeys);
    return QUICK_ACTIONS.filter(
        (a) =>
            (!a.moduleKey || !available || available.has(a.moduleKey)) &&
            navCan({ role, actions }, a.action) &&
            (a.limit !== "website" || mayAddWebsite(siteCount)) &&
            (a.limit !== "storefront" || mayAddStorefront(storefronts)),
    );
}

/*
 * Home's New menu (DEC-171, plan U5): the three daily starts, by the
 * greeting on a desk and behind the + on a phone. Not a second list: each
 * row is a quick action above, so it opens the same flow, in the same
 * place, for the same permission. The command menu keeps its full list.
 */

/** Which of the three starts. */
export type HomeNewKey = "order" | "booking" | "invoice";

/** One row of Home's New menu, as the board draws it. */
export interface HomeNewItem {
    key: HomeNewKey;
    href: string;
    /** The board's words: what the person does, not "New order". */
    label: string;
    /** The second line, under the label. */
    hint: string;
}

interface HomeNewRow extends HomeNewItem {
    moduleKey?: string;
    /** What the API asks of the write this row starts. */
    action: string;
    /** Named in the role line when the person may not ("Taking orders"). */
    doing: string;
}

/** The quick action a row of the New menu starts. */
function quick(href: string): QuickAction {
    const found = QUICK_ACTIONS.find((a) => a.href === href);
    if (!found) throw new Error(`No quick action opens ${href}`);
    return found;
}

function homeRow(
    key: HomeNewKey,
    href: string,
    words: { label: string; hint: string; doing: string },
): HomeNewRow {
    const row = quick(href);
    const action = typeof row.action === "string" ? row.action : row.action[0];
    return { key, href, moduleKey: row.moduleKey, action, ...words };
}

export const HOME_NEW: readonly HomeNewRow[] = [
    homeRow("order", "/commerce/orders?new=1", {
        label: "Take an order",
        hint: "In the shop or on the phone",
        doing: "Taking orders",
    }),
    homeRow("booking", "/bookings?new=1", {
        label: "Book someone",
        hint: "A class, a visit or a time",
        doing: "Booking people",
    }),
    homeRow("invoice", "/billing/invoices/new", {
        label: "Send an invoice",
        hint: "For a client or a trade customer",
        doing: "Sending invoices",
    }),
];

/** What Home's New menu offers this person, and what it says it doesn't. */
export interface HomeNew {
    items: HomeNewItem[];
    /**
     * One line naming the starts the business has but this person's role
     * doesn't ("Sending invoices isn't part of your role. …"); null when
     * there are none, or when nothing is offered (no menu is drawn then).
     */
    roleLine: string | null;
}

/**
 * Home's New menu for one person (DEC-171, A17): the rows whose module is
 * on (or not yet known) and whose write their permissions hold.
 *
 * Decided by the permissions the API resolved (`permits`), never by the
 * role's name or the rail's `navCan` fallback: a Member holds
 * `booking:write` (DEC-170) though the rail's mirror of the built-in roles
 * doesn't list it, and a role the business made is whatever was ticked. No
 * permissions loaded offers nothing; the API is the authority either way.
 *
 * A start whose module is off is left out and not named: the business
 * doesn't do it, so the role has nothing to do with it.
 */
export function homeNewFor({
    moduleKeys,
    actions,
}: {
    /** The modules that are on, or null while that isn't known. */
    moduleKeys: readonly string[] | null;
    /** The permissions the API resolved for this person. */
    actions: readonly string[] | null | undefined;
}): HomeNew {
    const on = moduleKeys === null ? null : new Set(moduleKeys);
    const here = HOME_NEW.filter(
        (row) => !row.moduleKey || !on || on.has(row.moduleKey),
    );
    const may = (row: HomeNewRow) =>
        permits({ actions: actions ?? [] }, row.action);
    const items = here
        .filter(may)
        .map(({ key, href, label, hint }) => ({ key, href, label, hint }));
    const lacking = here.filter((row) => !may(row));
    return {
        items,
        roleLine:
            items.length > 0 && lacking.length > 0
                ? notInRole(lacking.map((row) => row.doing))
                : null,
    };
}

/**
 * The modules the business has on, for `homeNewFor`. A module reads
 * DISABLED for this person when their role doesn't reach it
 * (`UNAUTHORIZED`), yet the business still does it: that start is one
 * their role leaves out, and the role line names it ("Taking orders …
 * aren't part of your role"), never drops it as if the business didn't
 * sell (Calendar only, #868). Any other closed gate is the business's.
 */
export function homeNewModuleKeys(modules: readonly ModuleView[]): string[] {
    return modules
        .filter(
            (m) =>
                m.readiness !== "DISABLED" ||
                (m.lifecycle === "ENABLED" &&
                    m.blockers.length > 0 &&
                    m.blockers.every((b) => b.code === "UNAUTHORIZED")),
        )
        .map((m) => m.key);
}

/** "Taking orders and sending invoices aren't part of your role. …" */
function notInRole(doing: readonly string[]): string {
    const named = doing
        .map((d, i) => (i === 0 ? d : d.charAt(0).toLowerCase() + d.slice(1)))
        .join(doing.length > 2 ? ", " : " and ")
        .replace(/, ([^,]+)$/, " and $1");
    const verb = doing.length === 1 ? "isn't" : "aren't";
    return `${named} ${verb} part of your role. ${WHO_CAN_CHANGE}`;
}
