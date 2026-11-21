import { HttpException, HttpStatus } from "@nestjs/common";

import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";
import type { CustomerContext } from "./customer-context.decorator";

const DAY_MS = 24 * 60 * 60_000;

/**
 * A site customer's moves and cancels (02-limits L3). Each one queues a
 * notice to the customer and the team and a Google update that emails every
 * guest, and a customer account costs nothing, so they are counted per
 * account and per booking, in Redis.
 */
export interface BookingChangeLimiters {
    perBooking: WindowLimiter;
    perAccount: WindowLimiter;
}

export const bookingChangeLimiters: BookingChangeLimiters = {
    perBooking: new SharedRateLimiter("site-booking-change", 5, DAY_MS),
    perAccount: new SharedRateLimiter(
        "site-account-booking-change",
        20,
        DAY_MS,
    ),
};

/** Take one change for `ref`, or throw a 429 with a sentence. */
export async function takeBookingChange(
    customer: CustomerContext,
    ref: string,
    limiters: BookingChangeLimiters = bookingChangeLimiters,
): Promise<void> {
    const accountKey = `${customer.organizationId}:${customer.accountId}`;
    const bookingKey = `${accountKey}:${ref}`;
    if (
        (await limiters.perAccount.take(accountKey)) &&
        (await limiters.perBooking.take(bookingKey))
    ) {
        return;
    }
    throw new HttpException(
        {
            message:
                "You've changed your bookings several times today. Try again tomorrow, or contact the business.",
            details: { reason: "too-many" },
        },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}
