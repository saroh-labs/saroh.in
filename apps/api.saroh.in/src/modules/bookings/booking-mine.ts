import type { Prisma } from "@saroh/database";

import type { TeamAlertPayload } from "../notifications/team-alerts";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { BookingEventType } from "./booking-event-type";

/**
 * "Bookings with you" (DEC-174 D7, #1138): who `booking.notify` tells of a
 * booking event in their own alerts, queued as `team.alert`
 * `booking-mine`, one per person (`notifications/booking-mine-alerts.ts`
 * words and sends it).
 *
 * - Booked, moved or cancelled: the person it is with.
 * - Given to someone else (#1157): both people, the one it left
 *   ("moved-away") and the one it went to ("new").
 * - Only someone on the diary with a login, never whoever did it.
 */

type Tx = Pick<Prisma.TransactionClient, "job" | "staffMember">;
type Change = Extract<TeamAlertPayload, { event: "booking-mine" }>["change"];

/** The event, as much of it as this needs. */
export interface MineEvent {
    id: string;
    type: string;
    actorUserId: string | null;
    fromStaffId?: string | null;
    toStaffId?: string | null;
}

/** Who is told of `event`, and as what: staff ids, not yet people. */
export function staffToTell(
    event: MineEvent,
    bookingStaffId: string | null | undefined,
    kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED",
): { staffId: string; change: Change }[] {
    if (event.type === BookingEventType.Reassigned) {
        const out: { staffId: string; change: Change }[] = [];
        if (event.toStaffId) {
            out.push({ staffId: event.toStaffId, change: "new" });
        }
        if (event.fromStaffId && event.fromStaffId !== event.toStaffId) {
            out.push({ staffId: event.fromStaffId, change: "moved-away" });
        }
        return out;
    }
    if (!bookingStaffId) return [];
    const change: Change =
        kind === "BOOKING_MOVED"
            ? "moved"
            : kind === "BOOKING_CANCELLED"
              ? "cancelled"
              : "new";
    return [{ staffId: bookingStaffId, change }];
}

/**
 * Queue each person's alert on the caller's transaction. Nothing for an
 * event-less job (one queued before A14): there is no event to key it to.
 */
export async function queueStaffAlertsInTx(
    tx: Tx,
    organizationId: string,
    input: {
        bookingId: string;
        bookingStaffId: string | null | undefined;
        event: MineEvent | null;
        kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED";
    },
): Promise<void> {
    const { event } = input;
    if (!event) return;
    const told = staffToTell(event, input.bookingStaffId, input.kind);
    if (told.length === 0) return;
    const people = await tx.staffMember.findMany({
        where: {
            organizationId,
            id: { in: told.map((t) => t.staffId) },
        },
        select: { id: true, membership: { select: { userId: true } } },
    });
    for (const t of told) {
        const userId = people.find((p) => p.id === t.staffId)?.membership
            ?.userId;
        // No login: no address. Who did it already knows.
        if (!userId || userId === event.actorUserId) continue;
        await enqueueTeamAlert(tx, organizationId, {
            event: "booking-mine",
            bookingId: input.bookingId,
            eventId: event.id,
            userId,
            change: t.change,
        });
    }
}
