/**
 * What each business lifecycle state means everywhere it matters (#921).
 *
 * An operator moves a business through `ACTIVE`, `SUSPENDED`,
 * `PENDING_DELETION` and `DELETED_RETAINED` (`admin-access.service.ts`,
 * DEC-021). #907 added the last step and nothing else changed: billing went
 * on renewing, the website stayed up and the members could still sign in.
 * The states had been added without a decision for each place they touch.
 *
 * This table is that decision, one row per state, and every place reads it
 * rather than its own list of names:
 *
 * - `activity`: activity in the business — a workspace write, an enquiry,
 *   booking or payment from its pages (`organization-lifecycle.gate.ts`).
 *   `open` takes anything; `wind-down` (DEC-117) takes nothing new but lets
 *   the business finish what it already started — progress, cancel and
 *   refund existing orders, bookings and memberships, and take payment for
 *   ones already owed; `closed` takes nothing. Which workspace write is
 *   which is its {@link LifecycleWriteClass}.
 * - `billing`: anything that charges or renews — Saroh's own plan (a
 *   checkout, an add-on, a renewal sent to the provider) and the business's
 *   charges to its own customers (a membership renewal, an autopay debit).
 * - `publicSite`: its website, by its Saroh address, a custom domain, a test
 *   release or a preview link, and every public read keyed by its site.
 * - `members`: whether its people can open it at all. Saroh staff read it
 *   through the admin console whatever the state; that is not a membership.
 *
 * `Record<OrganizationLifecycleStatus, …>` makes a new state a compile error
 * until it has a row, and `organization-lifecycle.policy.spec.ts` checks the
 * database's CHECK constraint names no state this table lacks and that each
 * consumer still asks it.
 */
export const OrganizationLifecycleStatus = {
    Active: "ACTIVE",
    Suspended: "SUSPENDED",
    PendingDeletion: "PENDING_DELETION",
    DeletedRetained: "DELETED_RETAINED",
} as const;

export type OrganizationLifecycleStatus =
    (typeof OrganizationLifecycleStatus)[keyof typeof OrganizationLifecycleStatus];

export interface LifecycleDecision {
    activity: "open" | "wind-down" | "closed";
    billing: "charges" | "refused";
    publicSite: "online" | "offline";
    members: "open" | "closed";
}

export const LIFECYCLE_DECISIONS: Readonly<
    Record<OrganizationLifecycleStatus, LifecycleDecision>
> = {
    ACTIVE: {
        activity: "open",
        billing: "charges",
        publicSite: "online",
        members: "open",
    },
    // Suspension stops activity; it is not a closure (DEC-021). The plan
    // keeps billing, the site stays up and its people can read.
    SUSPENDED: {
        activity: "closed",
        billing: "charges",
        publicSite: "online",
        members: "open",
    },
    // The window (owner, 9 Oct, #921): no renewal is charged and nothing new
    // can start, but it can still be reinstated, so the site and the door
    // stay as they were. It winds down (owner, 9 Oct, DEC-117): what was
    // already started can be finished, cancelled or refunded.
    PENDING_DELETION: {
        activity: "wind-down",
        billing: "refused",
        publicSite: "online",
        members: "open",
    },
    // Deleted (owner, 9 Oct, #921): offline, closed to its members, billed
    // for nothing; its records are kept (ADR-008).
    DELETED_RETAINED: {
        activity: "closed",
        billing: "refused",
        publicSite: "offline",
        members: "closed",
    },
};

export const ORGANIZATION_LIFECYCLE_STATES = Object.keys(
    LIFECYCLE_DECISIONS,
) as OrganizationLifecycleStatus[];

/**
 * The row for a stored state. A value the table doesn't know (the column is
 * text) is treated as the most closed row: refused, offline, closed.
 */
export function lifecycleDecision(status: string): LifecycleDecision {
    return (
        (LIFECYCLE_DECISIONS as Partial<Record<string, LifecycleDecision>>)[
            status
        ] ?? LIFECYCLE_DECISIONS.DELETED_RETAINED
    );
}

/** May the business take new activity? */
export function activityOpen(status: string): boolean {
    return lifecycleDecision(status).activity === "open";
}

/**
 * Is the business winding down (DEC-117)? Nothing new, but what it already
 * started can be finished.
 */
export function windingDown(status: string): boolean {
    return lifecycleDecision(status).activity === "wind-down";
}

/**
 * What a write in the workspace does, for the lifecycle (owner, 9 Oct,
 * DEC-117). Every route is `new` unless it says otherwise
 * (`@LifecycleWrite`, `common/decorators/lifecycle-write.decorator.ts`):
 *
 * - `new`: starts or changes something — an order, a booking, a sale, a
 *   product, a setting, an invitation. Open only while `activity` is open.
 * - `wind-down`: finishes, cancels or refunds something already started,
 *   or takes the money already owed for it. Open while the business is
 *   open or winding down.
 * - `takeout`: the business taking its own data away ("Download your
 *   data"). Open in every state whose members may open the business.
 */
export type LifecycleWriteClass = "new" | "wind-down" | "takeout";

export const LIFECYCLE_WRITE_CLASSES: readonly LifecycleWriteClass[] = [
    "new",
    "wind-down",
    "takeout",
];

/** May a write of this class go ahead in this state? */
export function lifecycleAllows(
    status: string,
    writeClass: LifecycleWriteClass,
): boolean {
    const decision = lifecycleDecision(status);
    if (decision.members === "closed") return false;
    switch (writeClass) {
        case "takeout":
            return true;
        case "wind-down":
            return decision.activity !== "closed";
        case "new":
            return decision.activity === "open";
    }
}

/** May anything charge or renew for this business? */
export function billingMayCharge(status: string): boolean {
    return lifecycleDecision(status).billing === "charges";
}

/** Does its website answer? */
export function publicSiteOnline(status: string): boolean {
    return lifecycleDecision(status).publicSite === "online";
}

/** May its members open it? */
export function membersMayOpen(status: string): boolean {
    return lifecycleDecision(status).members === "open";
}

function statesWhere(
    test: (decision: LifecycleDecision) => boolean,
): OrganizationLifecycleStatus[] {
    return ORGANIZATION_LIFECYCLE_STATES.filter((s) =>
        test(LIFECYCLE_DECISIONS[s]),
    );
}

/** The states whose website answers, for a Prisma `organization` filter. */
export const SITE_ONLINE_STATES = statesWhere((d) => d.publicSite === "online");

/** The states whose billing may charge, for a Prisma `organization` filter. */
export const BILLING_STATES = statesWhere((d) => d.billing === "charges");

/** `organization: SITE_ONLINE_ORGANIZATION` on a public site read. */
export const SITE_ONLINE_ORGANIZATION = {
    lifecycleStatus: { in: SITE_ONLINE_STATES },
};

/** `organization: BILLING_ORGANIZATION` on a list of charges to make. */
export const BILLING_ORGANIZATION = {
    lifecycleStatus: { in: BILLING_STATES },
};
