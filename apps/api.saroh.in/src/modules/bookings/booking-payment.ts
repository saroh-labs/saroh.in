import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    noProviderReason,
    planTakesOnlinePayment,
} from "../billing/online-payments-plan";
import { paymentsOn } from "../invoices/payments-on";
import { OPENS_CHECKOUT } from "../payments/public-key";
import type { BookingPayment, BookingRulesValue } from "./booking-rules";
import { allowsDesk, allowsOnline, loadBookingRules } from "./booking-rules";
import type { AccountBookPay } from "./dto";

/*
 * How people pay when they book (DEC-088, #821, #822): the business's
 * choice — online, at the desk, or both — and whether online can be taken
 * at all. The booking page offers only what both allow, the booking write
 * refuses anything else, and the merchant's screens say what happens to a
 * deposit online can't take: paid at the desk where the business allows
 * the desk, else it can't be booked online (DEC-089).
 */

/**
 * Why money can't be taken online when someone books, or null when it
 * can: Payments switched off, or no provider connected whose checkout can
 * open (a Razorpay connection still missing its public key id can't,
 * DEC-054).
 */
export type OnlineBlocker = "PLAN" | "PAYMENTS_OFF" | "NO_PROVIDER";

/**
 * …and its plan: one without online payments (the catalogue's `payments`
 * row, behind PLAN_ENFORCEMENT, failing open) takes no new online payment
 * (R28, `billing/online-payments-plan.ts`). Asked first: on such a plan the
 * other two can't be fixed by the business anyway.
 */
export async function onlinePaymentBlocker(
    organizationId: string,
): Promise<OnlineBlocker | null> {
    const [plan, on, provider] = await Promise.all([
        planTakesOnlinePayment(organizationId),
        paymentsOn(prisma, organizationId),
        prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            select: { id: true },
        }),
    ]);
    if (!plan) return "PLAN";
    if (!on) return "PAYMENTS_OFF";
    // None connected, and the plan may not let one be (UX-017).
    return provider === null ? noProviderReason(organizationId) : null;
}

/**
 * What the merchant's screens read to say what happens to a deposit
 * online can't take (#821, DEC-089): the business's way to pay, and why online can't be taken
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

/**
 * Whether a service that asks a deposit (or the full price) at booking is
 * booked to pay at the desk instead (DEC-089): the business allows the
 * desk, and online can't be taken — it chose At the desk, or Payments is
 * off, or no provider can take it. Under Online only it never is: that
 * service can't be booked online at all.
 */
export async function depositPaidAtDesk(
    organizationId: string,
    rules: Pick<BookingRulesValue, "bookingPayment">,
): Promise<boolean> {
    if (!allowsDesk(rules)) return false;
    if (!allowsOnline(rules)) return true;
    return (await onlinePaymentBlocker(organizationId)) !== null;
}

/**
 * "Get in touch" — said only when a service can't be booked online at all:
 * the business takes payment online only, and online can't be taken now.
 */
export const DEPOSIT_UNPAYABLE =
    "This business can't take the deposit online right now. Get in touch with them to book.";
const ONLINE_UNPAYABLE =
    "This business can't take payment online right now. Get in touch with them to book.";

/**
 * Refuses a way to pay the business doesn't allow (DEC-088), before
 * anything is held. A credit (A10) is not a payment and is never refused
 * here. A service with no price is booked with nothing to pay, whatever
 * the rule. `pay` is already what the service allows (`payAtBooking`):
 * a deposit service is DESK by then only when it is paid at the desk
 * (DEC-089).
 */
export function refuseDisallowedPay(
    service: { priceCents: number | null },
    pay: AccountBookPay | undefined,
    rules: Pick<BookingRulesValue, "bookingPayment">,
): void {
    if (pay === "CREDIT") return;
    if (pay === "NOW" || pay === "DEPOSIT") {
        if (allowsOnline(rules)) return;
        // At the desk only: a deposit too is paid at the desk (DEC-089).
        throw new ConflictException({
            message:
                "This business takes payment at the desk. Book it to pay at the desk.",
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
 * (or Payments is off): where the business allows the desk, the desk is
 * the way — a deposit too (DEC-089); a business that takes payment only
 * online can't be booked online at all.
 */
export function onlineUnavailableMessage(
    hasDeposit: boolean,
    rules: Pick<BookingRulesValue, "bookingPayment">,
): string {
    if (allowsDesk(rules)) {
        return "This business isn't taking payment online right now. Book it to pay at the desk.";
    }
    return hasDeposit ? DEPOSIT_UNPAYABLE : ONLINE_UNPAYABLE;
}
