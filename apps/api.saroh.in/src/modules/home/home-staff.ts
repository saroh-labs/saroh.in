import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { isLocationScoped } from "../orders/order-location";
import type { HomeInput, HomeStaff } from "./home-model";

/**
 * The staff landing (round 2, F11): a Member, or someone in a role the
 * business made (Front desk, Dentist), lands on their own day — the
 * storefronts they work on and, where they are on the diary, their own
 * bookings.
 *
 * Nothing here decides what a person may read. Every source still asks the
 * viewer's own capabilities (DEC-039), exactly as on the business's Home;
 * this file only narrows what those reads cover:
 *
 * - **Storefronts** come from the viewer's storefront roles (`StoreMembers`,
 *   DEC-048). None means every storefront, and so does a role on every one
 *   of them — "Hill Road only" is said only when it is true. Open orders,
 *   pick-ups, stock short, reviews, and the orders and reviews in the last
 *   24 hours and this week follow them.
 * - **The diary** follows the staff member the viewer is on it as
 *   (`Membership.staffMember`), when one is linked and active: the bookings
 *   they take, and those nobody was put on for a service they take. Today
 *   and the next booking follow it.
 *
 * What belongs to the whole business — invoices, renewals, messages,
 * booking-page notes, the takings figure — isn't a storefront's, so it is
 * never narrowed; whoever may read it reads it all.
 *
 * There is no switch on Home (design): the narrowing is Team's to change.
 */

type Db = typeof prisma;

/** What a Home read covers: every storefront and booking, or fewer. */
export interface HomeNarrow {
    /** The storefronts, by id; null for every one. */
    storeIds: readonly string[] | null;
    /** The staff member whose diary Today shows; null for everyone's. */
    staff: { id: string; serviceIds: readonly string[] } | null;
}

/** The business's Home: nothing narrowed. */
export const WHOLE_BUSINESS: HomeNarrow = { storeIds: null, staff: null };

/**
 * Whether this viewer lands on the staff view: anyone below Admin who
 * isn't a Reviewer. A role the business made resolves to `MEMBER` in the
 * request context, so Front desk and Dentist are staff too; what each of
 * them sees is still their own capabilities'.
 */
export function isStaffView(input: HomeInput): boolean {
    return input.organizationRole === "MEMBER" && Boolean(input.userId);
}

/**
 * The viewer's storefronts and diary. Three small reads; any that fails
 * throws, as module availability does: Home can't say what is the viewer's
 * without them, and guessing would show a Hill Road clerk every shop's
 * orders under a heading that says "Hill Road only".
 */
export async function readStaffNarrow(
    db: Db,
    input: HomeInput,
): Promise<{ narrow: HomeNarrow; staff: HomeStaff }> {
    const userId = input.userId ?? "";
    const live = { organizationId: input.organizationId, deletedAt: null };
    const [roles, storefronts, membership] = await Promise.all([
        db.storeMembers.findMany({
            where: { userId, store: live },
            orderBy: [{ store: { name: "asc" } }, { storeId: "asc" }],
            select: { store: { select: { id: true, name: true } } },
        }),
        db.store.count({ where: live }),
        db.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: input.organizationId,
                    userId,
                },
            },
            select: {
                staffMember: {
                    select: {
                        id: true,
                        status: true,
                        services: { select: { serviceId: true } },
                    },
                },
            },
        }),
    ]);

    // A role on every storefront narrows nothing, so says nothing.
    const stores =
        roles.length > 0 && roles.length < storefronts
            ? roles.map((r) => ({ id: r.store.id, name: r.store.name }))
            : null;
    const member = membership?.staffMember;
    // An archived staff member takes no bookings; their Home is the diary's.
    const staff =
        member?.status === "ACTIVE"
            ? {
                  id: member.id,
                  serviceIds: member.services.map((s) => s.serviceId),
              }
            : null;

    // A Storefront team holder's orders are their storefronts' only
    // (DEC-074, as the Orders API narrows them): on none, Home shows none,
    // never every storefront's.
    const storeIds = stores
        ? stores.map((s) => s.id)
        : roles.length === 0 && isLocationScoped(input.organizationRoleKey)
          ? []
          : null;
    return {
        narrow: { storeIds, staff },
        staff: { stores, ownDiary: staff !== null },
    };
}

/** A where on `storeId` for the narrowed storefronts; empty for all. */
export function storeWhere(storeIds: readonly string[] | null | undefined): {
    storeId?: { in: string[] };
} {
    return storeIds ? { storeId: { in: [...storeIds] } } : {};
}

/** The same, as SQL on the alias's `storeId`: `AND o."storeId" IN (…)`. */
export function storeSql(
    storeIds: readonly string[] | null | undefined,
    alias: string,
): Prisma.Sql {
    if (!storeIds) return Prisma.empty;
    // No storefront at all matches nothing, never everything.
    if (storeIds.length === 0) return Prisma.sql` AND FALSE`;
    return Prisma.sql` AND ${Prisma.raw(`${alias}."storeId"`)} IN (${Prisma.join(
        [...storeIds],
    )})`;
}

/**
 * The Orders list opened on the one storefront a count covers, so its link
 * shows the rows it counted (`?storefront=`, the list's own filter). The
 * list filters one storefront at a time: for several, or all, the path
 * stays as it is.
 */
export function onOneStore(
    path: string,
    storeIds: readonly string[] | null | undefined,
): string {
    if (storeIds?.length !== 1) return path;
    const glue = path.includes("?") ? "&" : "?";
    return `${path}${glue}storefront=${encodeURIComponent(storeIds[0])}`;
}

/** Only what sits in one of the narrowed storefronts; all of it for none. */
export function inStores<T extends { storeId: string }>(
    rows: readonly T[],
    storeIds: readonly string[] | null | undefined,
): T[] {
    if (!storeIds) return [...rows];
    const keep = new Set(storeIds);
    return rows.filter((row) => keep.has(row.storeId));
}

/**
 * The viewer's own bookings: the ones they take, and the ones nobody was
 * put on for a service they take (a booking made before staff existed, or
 * a class they teach). Empty for everyone's.
 */
export function diaryWhere(
    staff: HomeNarrow["staff"] | undefined,
): Prisma.BookingWhereInput {
    if (!staff) return {};
    if (staff.serviceIds.length === 0) return { staffId: staff.id };
    return {
        OR: [
            { staffId: staff.id },
            { staffId: null, serviceId: { in: [...staff.serviceIds] } },
        ],
    };
}
