import type { LucideIcon } from "lucide-react";
import {
    CalendarPlus,
    Globe,
    GraduationCap,
    ReceiptText,
    Repeat,
    Store,
    Ticket,
} from "lucide-react";

import type { StorefrontAllowance } from "@/lib/business-limits";
import { mayAddStorefront, mayAddWebsite } from "@/lib/business-limits";

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
