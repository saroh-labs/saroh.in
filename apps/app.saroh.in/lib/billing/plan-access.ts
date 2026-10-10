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
 * Permissions, never role names. A response with no permissions (a cached
 * or older one) falls back to the built-in map: Owner and Admin hold both.
 * The API stays the authority and refuses whatever this lets through.
 *
 * Pure and client-safe.
 */
interface Actor {
    role?: string | null;
    actions?: readonly string[] | null;
}

function holds(actor: Actor | null | undefined, action: string): boolean {
    if (actor?.actions) return actor.actions.includes(action);
    return actor?.role === "OWNER" || actor?.role === "ADMIN";
}

/** `billing:read`: may open Plan and billing and read what Saroh costs. */
export function mayOpenPlan(actor: Actor | null | undefined): boolean {
    return holds(actor, "billing:read");
}

/**
 * `billing:manage`: may change the plan. Asked by every plan prompt: a
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
