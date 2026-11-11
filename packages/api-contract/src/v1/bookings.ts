import { z } from "zod";

import { id, money, openEnum, page, pageQuery } from "../common";
import { defineRoute } from "../openapi";
import { idParam, instant, text, timestamp } from "./shared";

/**
 * Bookings on `/v1` (plan 2026-11-10-001, U8): list, get, create, move and
 * cancel. A cancel applies the business's own policy, refund included,
 * through its own payment provider, as the app's cancel does. The booking's
 * intake note is sensitive and never in an answer.
 */

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export const BOOKING_OUTCOMES = ["attended", "no_show"] as const;
export const REFUND_STATUSES = ["sent", "confirming", "refused"] as const;

export const bookingView = z
    .object({
        id,
        serviceId: id,
        contactId: id.nullable(),
        staffId: id.nullable(),
        status: openEnum(BOOKING_STATUSES, "Whether the booking stands"),
        startAt: timestamp,
        endAt: timestamp,
        timezone: z.string(),
        booker: z.object({
            name: z.string().nullable(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
        }),
        outcome: openEnum(
            BOOKING_OUTCOMES,
            "How the visit went; null until someone says",
        ).nullable(),
        cancelledAt: timestamp.nullable(),
        createdAt: timestamp,
    })
    .describe("Booking");
export type BookingView = z.infer<typeof bookingView>;

export const cancelledBookingView = bookingView
    .extend({
        /** What the cancel did with money paid online: the business's policy. */
        money: z.object({
            refund: z
                .object({
                    amount: money,
                    status: openEnum(
                        REFUND_STATUSES,
                        "sent: the provider took it; confirming: its answer is awaited; refused: none was made",
                    ),
                })
                .nullable(),
            kept: money.nullable(),
        }),
    })
    .describe("CancelledBooking");
export type CancelledBookingView = z.infer<typeof cancelledBookingView>;

export const listBookingsQuery = pageQuery.extend({
    status: z.enum(BOOKING_STATUSES).optional(),
    serviceId: id.optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;

export const createBookingBody = z
    .strictObject({
        serviceId: id,
        startAt: instant,
        /** An existing customer; or the booker's details below. */
        contactId: id.optional(),
        bookerName: text(200).optional(),
        bookerEmail: z.email().max(254).optional(),
        bookerPhone: text(32).optional(),
        staffId: id.optional(),
    })
    .refine(
        (b) => b.contactId !== undefined || b.bookerEmail !== undefined,
        "Name the customer: contactId, or bookerEmail",
    );
export type CreateBookingBody = z.infer<typeof createBookingBody>;

export const moveBookingBody = z.strictObject({ startAt: instant });
export type MoveBookingBody = z.infer<typeof moveBookingBody>;

const bookingParams = idParam("bookingId");

export const v1ListBookings = defineRoute({
    method: "get",
    path: "/bookings",
    surface: "v1",
    tag: "Bookings",
    summary: "List bookings",
    request: { query: listBookingsQuery },
    responses: { 200: page(bookingView) },
    capability: "booking:read",
});

export const v1GetBooking = defineRoute({
    method: "get",
    path: "/bookings/:bookingId",
    surface: "v1",
    tag: "Bookings",
    summary: "Get a booking",
    request: { params: bookingParams },
    responses: { 200: bookingView },
    capability: "booking:read",
});

export const v1CreateBooking = defineRoute({
    method: "post",
    path: "/bookings",
    surface: "v1",
    tag: "Bookings",
    summary: "Book a service for someone",
    request: { body: createBookingBody },
    responses: { 201: bookingView },
    capability: "booking:write",
});

export const v1MoveBooking = defineRoute({
    method: "post",
    path: "/bookings/:bookingId/move",
    surface: "v1",
    tag: "Bookings",
    summary: "Move a booking to another time",
    request: { params: bookingParams, body: moveBookingBody },
    responses: { 200: bookingView },
    capability: "booking:write",
});

export const v1CancelBooking = defineRoute({
    method: "post",
    path: "/bookings/:bookingId/cancel",
    surface: "v1",
    tag: "Bookings",
    summary: "Cancel a booking under the business's policy",
    request: { params: bookingParams },
    responses: { 200: cancelledBookingView },
    capability: "booking:write",
});
