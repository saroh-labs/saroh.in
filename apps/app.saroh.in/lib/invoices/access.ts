import { whoCanChange } from "@/lib/access/who-can-change";
import { permits } from "@/lib/organizations/permits";
import { knownRoleName } from "@/lib/organizations/role-name";
import type { Organization } from "@/lib/organizations/service";

/**
 * Who reaches Payments' screens, and what the locked card says to someone
 * who doesn't (round-2 D18, after the Invoices, Invoice Detail and
 * Subscriptions designs). Pure, so the pages, the section's gate and their
 * tests ask the same thing.
 *
 * Only the role's permissions decide, never its name (DEC-098). With no
 * organization at all the API decides, so nothing is locked here.
 */
export function mayRead(
    organization: Pick<Organization, "role" | "actions"> | null,
    action: "invoice:read" | "subscription:read",
): boolean {
    if (!organization) return true;
    return permits(organization, action);
}

/**
 * Where `/billing` lands: Subscriptions, unless it can't be shown — Payments
 * is off (invoices need no module, DEC-070), the role reads invoices and
 * not subscriptions, or the plan locks memberships (UX-047: on a plan
 * without them the row opened on a locked tab) — then Invoices.
 * Subscriptions' own gate explains anything else.
 */
export function billingLanding(
    organization: Pick<Organization, "role" | "actions"> | null,
    paymentsOn: boolean,
    membershipsLocked = false,
): "/billing/subscriptions" | "/billing/invoices" {
    const SUBSCRIPTIONS = "/billing/subscriptions";
    const INVOICES = "/billing/invoices";
    if (!mayRead(organization, "invoice:read")) return SUBSCRIPTIONS;
    if (!paymentsOn || membershipsLocked) return INVOICES;
    return mayRead(organization, "subscription:read")
        ? SUBSCRIPTIONS
        : INVOICES;
}

/** Whose role it is, as the locked card names it. */
type Viewer = Pick<Organization, "role" | "roleKey" | "roleLabel" | "actions">;

export interface LockedCopy {
    title: string;
    text: string;
}

/** The menu's name for each. */
const WHAT = {
    payments: "Payments",
    invoices: "Invoices",
    subscriptions: "Subscriptions",
} as const;

/**
 * The locked card's words: what the person can't open, their role and that
 * it doesn't include it, and who can change that (`whoCanChange`). Never a
 * code (DEC-057).
 *
 * `what` is the one screen (Invoices, Subscriptions) for a role that reaches
 * Payments but not that screen, and for a role the business made. A built-in
 * Member or Reviewer who doesn't see payments at all is told Payments,
 * whichever of its screens they opened, as before.
 *
 * It used to have three wordings of its own, one per built-in role. A
 * Member was told "money stays with owners and admins", which stopped being
 * true once a business could give any role a money permission.
 */
export function paymentsLockedCopy(
    viewer: Viewer,
    what: "payments" | "invoices" | "subscriptions" = "payments",
): LockedCopy {
    // A built-in is stored under its own name, a role the business made
    // under its key. Words only: what the role may open is `mayRead`'s.
    const builtIn = (viewer.roleKey ?? viewer.role) === viewer.role;
    const seesPayments = viewer.actions?.includes("payment:read") ?? false;
    const outside =
        builtIn &&
        (viewer.role === "MEMBER" || viewer.role === "REVIEWER") &&
        !seesPayments;
    const { title, description, note } = whoCanChange({
        thing: WHAT[outside ? "payments" : what],
        role: knownRoleName(viewer),
    });
    return { title, text: `${description} ${note}` };
}
