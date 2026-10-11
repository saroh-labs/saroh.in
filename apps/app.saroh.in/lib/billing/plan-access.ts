/**
 * Who may open Plan and billing, and who may change the plan (UX audit,
 * 10 Oct 2026).
 *
 * The API asks two permissions there and nothing else: `billing:read` for
 * the plan, its usage and Saroh's invoices, and `billing:manage` for a plan
 * change, an add-on, a coupon and the payment method (`billing/*.service.ts`).
 * The page used to refuse anyone but the owner, by role name, while plan
 * prompts all over the app sent Admins to it. Now the page, the Settings
 * tab, the command menu and every plan prompt ask these two, so they agree
 * with each other and with the API.
 *
 * Only the Owner holds `billing:manage` (DEC-131, amended 2026-10-11): what
 * the business pays Saroh is the owner's to change. The API gives it to no
 * other role, made-up roles and extra permissions included. An Admin holds
 * `billing:read`, so Plan and billing opens for them to read.
 *
 * Permissions, never role names. A response with no permissions (a cached
 * or older one) falls back to the built-in map: Owner and Admin read, and
 * only the Owner changes. The API stays the authority and refuses whatever
 * this lets through.
 *
 * Pure and client-safe.
 */
interface Actor {
    role?: string | null;
    actions?: readonly string[] | null;
}

/** Who holds each with no permissions to read: the API's built-in map. */
const BUILT_IN: Readonly<Record<string, readonly string[]>> = {
    "billing:read": ["OWNER", "ADMIN"],
    "billing:manage": ["OWNER"],
};

function holds(actor: Actor | null | undefined, action: string): boolean {
    if (actor?.actions) return actor.actions.includes(action);
    return (
        typeof actor?.role === "string" &&
        (BUILT_IN[action] ?? []).includes(actor.role)
    );
}

/** `billing:read`: may open Plan and billing and read what Saroh costs. */
export function mayOpenPlan(actor: Actor | null | undefined): boolean {
    return holds(actor, "billing:read");
}

/**
 * `billing:manage`, the Owner's alone: may change the plan, an add-on, a
 * coupon and the payment method. Asked by every plan prompt: a
 * person who can't reads who can, never a link to a page that only shows
 * them what they can't press.
 */
export function mayChangePlan(actor: Actor | null | undefined): boolean {
    return holds(actor, "billing:manage");
}

/** Whether a link is the way to another plan (`upgradeHref`). */
export function isPlanHref(href: string | null | undefined): boolean {
    return href?.startsWith("/settings/billing") ?? false;
}
