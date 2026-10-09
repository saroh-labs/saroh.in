import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { isCalendarOnly } from "../organizations/calendar-only-role";

/**
 * A Calendar only person works their own diary (#868; owner decision
 * 2026-10-08).
 *
 * The role (`calendar-only`) holds `booking:read` and `booking:write`, and
 * what they reach is narrowed to the person's own bookings: the ones they
 * take, and those nobody was put on for a service they take (a class they
 * teach, a booking made before staff existed) — the same rule as F11's
 * staff Home (`home/home-staff.ts`). Like a location's orders
 * (`orders/order-location.ts`, DEC-074), the narrowing is keyed on the
 * role, not on a guard, and spread into each lookup:
 *
 * - a read of someone else's booking is a 404, as if it weren't there, and
 *   lists, the bookings calendar and the business calendar leave them out;
 * - a change to one (move, cancel, how it went) is a 403 in words;
 * - a booking made by hand is theirs: another person's diary is a 403.
 *
 * Someone in the role who isn't on the diary yet (invited before the owner
 * linked them) sees no bookings, never everyone's. Everyone else — every
 * built-in role, and every role a business made — is not narrowed.
 */

type Db = Pick<typeof prisma, "membership">;

/** What a Calendar only person says to someone else's booking. */
export const OWN_DIARY_REFUSAL = "Your role changes only your own bookings.";

/** And to booking someone in when they aren't on the diary. */
export const NOT_ON_DIARY_REFUSAL =
    "You aren't on the diary yet, so there's no diary of yours to book into. Ask the owner to add you.";

/** The person whose diary a narrowed caller works. */
export interface OwnDiary {
    /** Their staff member; null when they aren't on the diary. */
    staffId: string | null;
    /** The services they take, for bookings nobody was put on. */
    serviceIds: readonly string[];
}

/** Whether this role's bookings are narrowed to the person's own. */
export function isDiaryScoped(roleKey: string | null | undefined): boolean {
    return isCalendarOnly(roleKey);
}

/**
 * The caller's own diary, or null when they aren't narrowed. One small
 * read, only for a narrowed role.
 */
export async function ownDiaryOf(
    db: Db,
    ctx: Pick<OrganizationContext, "organizationId" | "userId" | "roleKey">,
): Promise<OwnDiary | null> {
    if (!isDiaryScoped(ctx.roleKey)) return null;
    const membership = await db.membership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
        },
        select: {
            staffMember: {
                select: {
                    id: true,
                    services: { select: { serviceId: true } },
                },
            },
        },
    });
    const staff = membership?.staffMember;
    // Archived or not, the bookings they took are still theirs to read.
    return staff
        ? {
              staffId: staff.id,
              serviceIds: staff.services.map((s) => s.serviceId),
          }
        : { staffId: null, serviceIds: [] };
}

/**
 * The bookings this caller may see, as a `where` to spread beside the
 * organization's: everything for null, else theirs. Wrapped in `AND`, so it
 * never replaces an `OR` the caller already has (`holdsPlace`).
 */
export function ownBookingsWhere(
    own: OwnDiary | null,
): Prisma.BookingWhereInput {
    if (!own) return {};
    // Not on the diary: nothing, never everything.
    if (!own.staffId) return { AND: [{ id: { in: [] } }] };
    if (own.serviceIds.length === 0) {
        return { AND: [{ staffId: own.staffId }] };
    }
    return {
        AND: [
            {
                OR: [
                    { staffId: own.staffId },
                    { staffId: null, serviceId: { in: [...own.serviceIds] } },
                ],
            },
        ],
    };
}

/** Whether a booking is on this diary (always, for null). */
export function isOwnBooking(
    own: OwnDiary | null,
    booking: { staffId: string | null; serviceId: string },
): boolean {
    if (!own) return true;
    if (!own.staffId) return false;
    if (booking.staffId === own.staffId) return true;
    return (
        booking.staffId === null && own.serviceIds.includes(booking.serviceId)
    );
}

/**
 * Before a narrowed caller reads or changes a booking already found in the
 * business: a read of another's is a 404, a change a 403. Nothing for
 * anyone else.
 */
export async function assertOwnBooking(
    db: Db,
    ctx: Pick<OrganizationContext, "organizationId" | "userId" | "roleKey">,
    booking: { staffId: string | null; serviceId: string },
    mode: "read" | "write",
): Promise<void> {
    const own = await ownDiaryOf(db, ctx);
    if (isOwnBooking(own, booking)) return;
    if (mode === "read") throw new NotFoundException("Booking not found");
    throw new ForbiddenException(OWN_DIARY_REFUSAL);
}

/**
 * Who a booking made by a narrowed caller is with: themselves. Asking for
 * someone else is a 403; not being on the diary at all is too. Anyone else
 * books with whoever they asked for (`staffId` as given).
 */
export async function bookingStaffFor(
    db: Db,
    ctx: Pick<OrganizationContext, "organizationId" | "userId" | "roleKey">,
    asked: string | undefined,
): Promise<string | undefined> {
    const own = await ownDiaryOf(db, ctx);
    if (!own) return asked;
    if (!own.staffId) throw new ForbiddenException(NOT_ON_DIARY_REFUSAL);
    if (asked && asked !== own.staffId) {
        throw new ForbiddenException(OWN_DIARY_REFUSAL);
    }
    return own.staffId;
}
