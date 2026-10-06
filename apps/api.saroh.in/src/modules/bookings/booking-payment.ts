import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { paymentsOn } from "../invoices/payments-on";
import { OPENS_CHECKOUT } from "../payments/public-key";
import type { BookingPayment, BookingRulesValue } from "./booking-rules";
import { allowsDesk, allowsOnline, loadBookingRules } from "./booking-rules";
import type { AccountBookPay } from "./dto";
import { depositCents } from "./service-fields";

/*
 * How people pay when they book (DEC-088, #821, #822): the business's
 * choice — online, at the desk, or both — and whether online can be taken
 * at all. The booking page offers only what both allow, the booking write
 * refuses anything else, and the merchant's screens say when a service
 * can't be booked online because of it.
 */

/**
 * Why money can't be taken online when someone books, or null when it
 * can: Payments switched off, or no provider connected whose checkout can
 * open (a Razorpay connection still missing its public key id can't,
 * DEC-054).
 */
export type OnlineBlocker = "PAYMENTS_OFF" | "NO_PROVIDER";

export async function onlinePaymentBlocker(
    organizationId: string,
): Promise<OnlineBlocker | null> {
    const [on, provider] = await Promise.all([
        paymentsOn(prisma, organizationId),
        prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            select: { id: true },
        }),
    ]);
    if (!on) return "PAYMENTS_OFF";
    return provider === null ? "NO_PROVIDER" : null;
}

/**
 * What the merchant's screens read to say when a service can't be booked
 * online (#821): the business's way to pay, and why online can't be taken
 * now, if it can't.
 */
export interface BookingPaymentView {
    bookingPayment: BookingPayment;
    onlineBlocker: OnlineBlocker | null;
}

export async function bookingPaymentView(
    organizationId: string,
): Promise<BookingPaymentView> {
    const [rules, blocker] = await Promise.all([
        loadBookingRules(prisma, organizationId),
        onlinePaymentBlocker(organizationId),
    ]);
    return { bookingPayment: rules.bookingPayment, onlineBlocker: blocker };
}

/** "Get in touch" — said when a service can't be booked online at all. */
export const DEPOSIT_UNPAYABLE =
    "This business can't take the deposit online right now. Get in touch with them to book.";
const ONLINE_UNPAYABLE =
    "This business can't take payment online right now. Get in touch with them to book.";

/**
 * Refuses a way to pay the business doesn't allow (DEC-088), before
 * anything is held. A credit (A10) is not a payment and is never refused
 * here. A service with no price is booked with nothing to pay, whatever
 * the rule. `pay` is already what the service allows (`payAtBooking`):
 * a deposit service is never DESK by then.
 */
export function refuseDisallowedPay(
    service: { priceCents: number | null; depositMode: string },
    pay: AccountBookPay | undefined,
    rules: Pick<BookingRulesValue, "bookingPayment">,
): void {
    if (pay === "CREDIT") return;
    if (pay === "NOW" || pay === "DEPOSIT") {
        if (allowsOnline(rules)) return;
        const deposit = depositCents(service.priceCents, service.depositMode);
        throw new ConflictException({
            message:
                deposit === null
                    ? "This business takes payment at the desk. Book it to pay at the desk."
                    : DEPOSIT_UNPAYABLE,
            field: "pay",
        });
    }
    // At the desk (or no way given, which books it to pay at the desk).
    if (allowsDesk(rules)) return;
    if (!service.priceCents || service.priceCents <= 0) return;
    throw new ConflictException({
        message:
            "This business takes payment online when you book. Pay now to book it.",
        field: "pay",
    });
}

/**
 * The refusal when pay now can't be taken because no provider can take it
 * (or Payments is off): a deposit, or a business that takes payment only
 * online, can't be booked online at all; otherwise the desk is the way.
 */
export function onlineUnavailableMessage(
    hasDeposit: boolean,
    rules: Pick<BookingRulesValue, "bookingPayment">,
): string {
    if (hasDeposit) return DEPOSIT_UNPAYABLE;
    return allowsDesk(rules)
        ? "This business isn't taking payment online right now. Book it to pay at the desk."
        : ONLINE_UNPAYABLE;
}
