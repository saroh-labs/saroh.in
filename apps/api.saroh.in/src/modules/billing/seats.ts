/**
 * Who uses a team seat (DEC-105). Classified by what a person can do, never
 * by their role's name:
 *
 * - **A seat** — anyone whose role (with their own extras, F17) carries a
 *   permission that changes something: books, sells, edits. Someone on the
 *   diary who takes bookings uses one whatever their role.
 * - **View-only** — everyone whose permissions only look: see, comment on a
 *   website, approve one. They use no seat and count toward the plan's
 *   `reviewers` row instead ("View-only people").
 *
 * The built-ins fall out of the rule: Owner, Admin and Member (who moves an
 * order's kitchen stage) use seats; Reviewer doesn't. A role the business
 * made is judged on what was ticked for it, implied holds included.
 */
import type { OrgAction } from "../organizations/organization-actions";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import {
    isBuiltInRole,
    resolveCapabilities,
} from "../organizations/organization-policy";

/**
 * Permissions that change nothing: every `…:read`, plus seeing a
 * customer's sensitive notes, exporting orders to a file, and the two
 * website review powers (a note and a sign-off change no page).
 */
export const VIEW_ONLY_ACTIONS: ReadonlySet<OrgAction> = new Set<OrgAction>([
    ...ORG_ACTIONS.filter((a) => a.endsWith(":read")),
    "customer:sensitive",
    "order:export",
    "site:comment",
    "site:approve",
]);

/** What a person is for the plan: a team seat, or one of its view-only people. */
export type SeatKind = "seat" | "viewOnly";

/** Whether every permission in `actions` only looks (an empty set does). */
export function onlyViews(actions: Iterable<OrgAction>): boolean {
    for (const a of actions) if (!VIEW_ONLY_ACTIONS.has(a)) return false;
    return true;
}

/** The seat kind of a resolved permission set. */
export function seatKindOf(
    actions: Iterable<OrgAction>,
    bookable = false,
): SeatKind {
    return !bookable && onlyViews(actions) ? "viewOnly" : "seat";
}

/** A business's own roles, as stored: key → the permissions ticked for it. */
export type RoleActions = ReadonlyMap<string, readonly string[]>;

/**
 * The seat kind of a role key in a business, with a person's extras and
 * whether they take bookings. A built-in reads the shipped policy; a role
 * the business made reads its row; a key with neither resolves to the
 * read-only floor, as the policy has it (`resolveCapabilities`).
 */
export function seatOf(
    roles: RoleActions,
    roleKey: string,
    extras?: readonly string[] | null,
    bookable = false,
): SeatKind {
    const stored = isBuiltInRole(roleKey) ? null : roles.get(roleKey);
    return seatKindOf(resolveCapabilities(roleKey, stored, extras), bookable);
}

/** Rows of `OrganizationRole` as a lookup for {@link seatOf}. */
export function roleActionsOf(
    rows: readonly { key: string; actions: string[] }[],
): RoleActions {
    return new Map(rows.map((r) => [r.key, r.actions]));
}

/** The catalogue row a seat kind is metered on. */
export function seatModule(kind: SeatKind): "members" | "reviewers" {
    return kind === "viewOnly" ? "reviewers" : "members";
}

/** A diary person who takes bookings (`StaffMember.status`). */
export const BOOKABLE_STAFF = "ACTIVE";
