/**
 * A write the API refused because of the person's role (UX audit, 10 Oct
 * 2026), as the screen says it.
 *
 * `authorize()` in the API used to throw `Role "MEMBER" may not perform
 * "store:create"`, and the app showed it. It now sends a sentence with
 * `details: { code: "ROLE_DENIED", action }`. This is the one place the app
 * reads that: `toFailure` and `readError` both ask it, so every write's
 * failure says the same thing, and marks it a denial for the caller to show
 * as a notice (`reportFailure`), never as the red error a breakage gets.
 *
 * Pure and client-safe. The copy rules of `who-can-change.ts` apply.
 */
import { WHO_CAN_CHANGE } from "@/lib/access/who-can-change";

/** `details.code` of a refusal by role (`organization-policy.ts`). */
export const ROLE_DENIED = "ROLE_DENIED";

/** Who can lift it. The same line a denied page ends on. */
const WHO = WHO_CAN_CHANGE;

/** What only the owner's role holds, whoever else is asked. */
const OWNER_ONLY = "Only the owner can do this.";

/**
 * What the business pays Saroh: the plan, an add-on, a coupon, the payment
 * method (`billing:manage`, DEC-131 amended 2026-10-11). The API's own
 * sentence for it.
 */
export const ONLY_OWNER_CHANGES_PLAN = "Only the owner can change the plan.";

/** Said when the API named no permission, or one with no line below. */
export const ROLE_DENIED_FALLBACK =
    "Your role can't do this. An owner or admin can change that in Settings › Team.";

/**
 * A closer sentence for the permissions people meet most: bookings, orders,
 * products, locations, customers, invoices, posts and the team. Keyed on the
 * API's own permission, so a new one falls back to the plain line until it
 * earns a row here.
 */
const CANT: Readonly<Record<string, string>> = {
    // Bookings
    "booking:read": "Your role can't see bookings.",
    "booking:write": "Your role can't change bookings.",
    "service:write":
        "Your role can't change services, hours, time off or booking rules.",
    "hours:write": "Your role can't change hours or time off.",
    // Orders
    "order:read": "Your role can't see orders.",
    "order:create": "Your role can't take orders.",
    "order:edit": "Your role can't change orders.",
    "order:write": "Your role can't change orders.",
    "order:refund": "Your role can't refund or cancel orders.",
    "order:export": "Your role can't export orders.",
    "order:stage": "Your role can't move orders through the kitchen.",
    // Products and locations
    "store:read": "Your role can't see products or locations.",
    "store:write": "Your role can't change products or locations.",
    "store:create": "Your role can't add a location.",
    "inventory:write": "Your role can't change stock.",
    "discount:write": "Your role can't change discount codes.",
    // Customers
    "contact:read": "Your role can't see customers.",
    "contact:write": "Your role can't change customers.",
    "customer:merge": "Your role can't merge customers.",
    "customer:remove": "Your role can't remove customers.",
    "lead:write": "Your role can't change leads.",
    "activity:write": "Your role can't add notes or follow-ups.",
    "message:write": "Your role can't send messages.",
    // Invoices and money
    "invoice:read": "Your role can't see invoices.",
    "invoice:write": "Your role can't make or change invoices.",
    "payment:manage": "Your role can't take or refund payments.",
    "subscription:write": "Your role can't change plans or subscriptions.",
    // Posts and the website
    "section:write": "Your role can't change pages or posts.",
    "site:create": "Your role can't make a website.",
    "site:update": "Your role can't change the website's settings.",
    "site:publish": "Your role can't publish the website.",
    // Team
    "member:read": "Your role can't see the team.",
    "member:invite": "Your role can't invite people.",
    "member:role:update": "Your role can't change what people can do.",
    "member:remove": "Your role can't remove people.",
    "module:manage": "Your role can't turn modules on or off.",
};

/**
 * What no role but the owner's is given (`OWNER_ONLY_ACTIONS` in the API),
 * and the sentence for each.
 */
const OWNERS: Readonly<Record<string, string>> = {
    "org:delete": OWNER_ONLY,
    "org:address:update": OWNER_ONLY,
    "billing:manage": ONLY_OWNER_CHANGES_PLAN,
};

/** The refusal in an error's `details`, or null when it isn't one. */
export function roleDeniedOf(
    details: unknown,
): { action: string | null } | null {
    if (typeof details !== "object" || details === null) return null;
    const { code, action } = details as { code?: unknown; action?: unknown };
    if (code !== ROLE_DENIED) return null;
    return { action: typeof action === "string" ? action : null };
}

/**
 * What a refused person reads: the closer sentence for the permission and
 * who can change it, else the plain line. Never the permission's key.
 */
export function roleDeniedSentence(action: string | null | undefined): string {
    const owners = action ? OWNERS[action] : undefined;
    if (owners) return owners;
    const cant = action ? CANT[action] : undefined;
    return cant ? `${cant} ${WHO}` : ROLE_DENIED_FALLBACK;
}

/**
 * Whether a sentence is a refusal by role, however it reached the screen.
 *
 * Most call sites only hold `res.error`, a string. The API words every
 * refusal by role one of two ways ("Your role can't …", "Only an owner can
 * …", `backend-auth-and-access.md`), and so does this file, so the sentence
 * itself says what it is. `showError` asks this (registered once in
 * `app/providers.tsx`) and says a refusal calmly, and `Refusal` asks it for
 * the line inside an open sheet, dialog or confirm.
 */
export function isRoleRefusal(sentence: string | null | undefined): boolean {
    const said = sentence?.trim();
    if (!said) return false;
    return /^(Your role |Only (the|an) owner can )/.test(said);
}

/** The `details` of any of the shapes the API returns an error in. */
export function errorDetails(body: unknown): unknown {
    if (typeof body !== "object" || body === null) return undefined;
    const { error, details } = body as { error?: unknown; details?: unknown };
    if (typeof error === "object" && error !== null) {
        const inner = (error as { details?: unknown }).details;
        if (inner !== undefined) return inner;
    }
    return details;
}

/** The sentence for a body that is a refusal by role, else null. */
export function roleDeniedMessage(body: unknown): string | null {
    const denied = roleDeniedOf(errorDetails(body));
    return denied ? roleDeniedSentence(denied.action) : null;
}
