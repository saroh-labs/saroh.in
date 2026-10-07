import type { Organization } from "@/lib/organizations/service";

/**
 * Who reaches Payments' screens, and what the locked card says to someone
 * who doesn't (round-2 D18, after the Invoices, Invoice Detail and
 * Subscriptions designs). Pure, so the pages, the section's gate and their
 * tests ask the same thing.
 *
 * Without resolved actions (an older response) the built-in roles decide:
 * money stays with an Owner and an Admin. With no organization at all the
 * API decides, so nothing is locked here.
 */
export function mayRead(
    organization: Pick<Organization, "role" | "actions"> | null,
    action: "invoice:read" | "subscription:read",
): boolean {
    if (!organization) return true;
    if (organization.actions) return organization.actions.includes(action);
    return organization.role === "OWNER" || organization.role === "ADMIN";
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

const BUILT_IN = new Set(["OWNER", "ADMIN", "MEMBER", "REVIEWER"]);

export interface LockedCopy {
    title: string;
    text: string;
}

/**
 * The locked card's words: why, and who can change it — never a code
 * (DEC-057). A Member and a Reviewer get the design's own sentences. A
 * role the business made is named, and told what it doesn't include:
 * `what` is "payments" at the section's door, or the one screen ("invoices")
 * when the role reaches Payments but not that screen — as does a Member
 * the business let see payments, for whom "money stays with owners and
 * admins" would not be true.
 */
export function paymentsLockedCopy(
    viewer: Viewer,
    what: "payments" | "invoices" | "subscriptions" = "payments",
): LockedCopy {
    const key = viewer.roleKey ?? viewer.role;
    const named = viewer.roleLabel?.trim();
    const seesPayments = viewer.actions?.includes("payment:read") ?? false;
    if (BUILT_IN.has(key) && viewer.role === "REVIEWER" && !seesPayments) {
        return {
            title: "You can't open payments",
            text: "Your role is Reviewer, which can see the website but not payments. An owner or admin can change that in Team.",
        };
    }
    if (BUILT_IN.has(key) && viewer.role === "MEMBER" && !seesPayments) {
        return {
            title: "Only owners and admins see payments",
            text: "Your role is Member — money stays with owners and admins. An owner or admin can change that in Team.",
        };
    }
    return {
        title: `You can't open ${what}`,
        text: `Your role${named ? ` is ${named}, which` : ""} doesn't include ${what}. An owner or admin can change that in Team.`,
    };
}
