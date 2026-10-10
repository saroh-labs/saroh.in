import { permits, permitsFor } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";

/**
 * Who reaches Orders, from what the API resolved for this person (plan B,
 * B7). Pure, so the list, Order Detail and their tests ask the same thing.
 *
 * - `open`: the list and an order, through `order:read` or, for the
 *   kitchen, `order:stage` alone (DEC-024). Someone holding neither (the
 *   Reviewer bundle, or a role the business made without them) is told so
 *   by the locked card — never a hidden screen, never a failure.
 * - `money`: totals and payments, through `order:read`. What someone may
 *   DO to an order is `orderPowers` below (B16).
 *
 * Only the role's permissions decide, never its name (DEC-098): a response
 * without them (cached or older) opens nothing. With no organization at all
 * the API decides, so nothing is locked here.
 */
export interface OrdersAccess {
    open: boolean;
    money: boolean;
}

export function ordersAccess(
    organization: Pick<Organization, "role" | "actions"> | null,
): OrdersAccess {
    if (!organization) return { open: true, money: true };
    const read = permits(organization, "order:read");
    return { open: read || permits(organization, "order:stage"), money: read };
}

/**
 * What this person may do to an order (B16, DEC-039), from what the API
 * resolved for them — each one the power its endpoint asks, so a screen
 * never offers what the API would refuse:
 *
 * - `stage`: move it through its steps and print (`order:stage`);
 * - `create`: take a new order and make its pay link (`order:create`);
 * - `edit`: change it after it's placed, and make a new pay link
 *   (`order:edit`);
 * - `payLink`: make or replace a pay link — `create` or `edit`;
 * - `refund`: refund and cancel (`order:refund`);
 * - `export`: the CSV (`order:export`).
 *
 * The API adds each part to a role saved with the old umbrella
 * (`order:write` → create, edit, export; `payment:manage` → refund), so the
 * umbrellas count here too: an API from before B16 sends only them.
 *
 * Only the role's permissions decide, never its name (DEC-098): a response
 * without them (cached or older) offers nothing. With no organization at
 * all the API decides, so nothing is withheld here.
 */
export interface OrderPowers {
    stage: boolean;
    create: boolean;
    edit: boolean;
    payLink: boolean;
    refund: boolean;
    export: boolean;
}

export function orderPowers(
    organization: { role: string; actions?: readonly string[] } | null,
): OrderPowers {
    if (!organization) {
        return {
            stage: true,
            create: true,
            edit: true,
            payLink: true,
            refund: true,
            export: true,
        };
    }
    const holds = permitsFor(organization);
    const write = holds("order:write");
    const create = holds("order:create") || write;
    const edit = holds("order:edit") || write;
    return {
        stage: holds("order:stage"),
        create,
        edit,
        payLink: create || edit,
        refund: holds("order:refund") || holds("payment:manage"),
        export: holds("order:export") || write,
    };
}

/**
 * Which Orders screen an address is (DEC-056): the list (and New order), one
 * order, or none. Sell's module gate asks it, so a role Sell is closed to
 * gets Orders' own locked card there rather than the generic one — the
 * gate runs in the section's layout, which can't see the route.
 */
export function ordersPlace(pathname: string | null): "list" | "order" | null {
    const parts = (pathname ?? "").split("/").filter(Boolean);
    if (parts[0] !== "commerce" || parts[1] !== "orders") return null;
    if (parts.length === 2 || parts[2] === "new") return "list";
    return "order";
}

/** Whose role it is, as the locked cards name it. */
interface Viewer {
    role: string;
    /** The business's own name for the role, for one it made. */
    roleLabel?: string | null;
}

/**
 * The Orders list's locked card, in the design's words: why, then — in a
 * block of its own — who can change it. A Reviewer is told what their role
 * does cover; any other role is named and told Orders isn't part of it.
 */
export function ordersLockedCopy(
    viewer: Viewer,
    businessName: string,
): { description: string; note: string } {
    const named = viewer.roleLabel?.trim();
    const description =
        viewer.role === "REVIEWER" && !named
            ? `Your role in ${businessName} is Reviewer, which covers one website and nothing about the business around it. Orders are not part of it.`
            : named
              ? `Your role in ${businessName} is ${named}. Orders are not part of it.`
              : `Your role in ${businessName} doesn't include orders.`;
    return {
        description,
        note: `The rail does not offer Sell to this role, so you have reached it by address. Ask an Owner or Admin of ${businessName} if you need it.`,
    };
}

/** Order Detail's locked card, in the design's words. */
export function orderLockedText(viewer: Viewer): string {
    const named = viewer.roleLabel?.trim();
    if (viewer.role === "REVIEWER" && !named) {
        return "Your role is Reviewer, which can see the website but not this. An owner or admin can change that in Team.";
    }
    return `Your role${named ? ` is ${named}, which` : ""} doesn't include orders. An owner or admin can change that in Team.`;
}
