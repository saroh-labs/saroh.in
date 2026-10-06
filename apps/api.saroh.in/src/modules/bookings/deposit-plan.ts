import type { Service } from "@saroh/database";

import { assertPlanTakesOnlinePayment } from "../billing/online-payments-plan";
import { onlinePaymentBlocker } from "./booking-payment";
import type { BookingRulesValue } from "./booking-rules";
import { allowsDesk } from "./booking-rules";

/*
 * Deposits and the plan (6 Oct 2026: "Online needs a paid plan; Free takes
 * money offline"). A deposit is taken online when the service is booked
 * (E8), so it is a paid feature — and, like every online-money feature, it
 * is checked where it is set up, never where the customer pays:
 *
 * - **Setting one** (a service's `depositMode` other than NONE) needs the
 *   plan's `payments` row: 403 `MODULE_LOCKED` otherwise. Taking it off
 *   (NONE), or saving a service with the deposit it already has, never
 *   asks — a business that moved to a plan without online payments can
 *   still edit everything else about the service.
 * - **Booking** when the business can't take money online, for any reason
 *   (`onlinePaymentBlocker`: a plan without online payments, Payments
 *   switched off, or no provider that can open the checkout), follows the
 *   business's "How people pay when they book" (DEC-088, DEC-089): Both or
 *   At the desk — a service that keeps a stored deposit books exactly like
 *   one that takes none, at the desk, no deposit offered; Online only —
 *   the deposit stands and the booking page says to get in touch. The
 *   stored `depositMode` is kept either way, so it comes back the moment
 *   money can be taken online again.
 *
 * The plan is asked behind `PLAN_ENFORCEMENT` and fails open (a plan that
 * can't be read takes the deposit as today). Staff bookings never ask: the
 * desk takes a deposit or not as staff say.
 */

/** 403 `MODULE_LOCKED` when a write would newly set a deposit the plan can't take. */
export async function assertDepositOnPlan(
    organizationId: string,
    depositMode: string | undefined,
    stored = "NONE",
): Promise<void> {
    if (depositMode === undefined || depositMode === "NONE") return;
    if (depositMode === stored) return;
    await assertPlanTakesOnlinePayment(organizationId);
}

/**
 * The service as the booking page books it (DEC-089): its stored deposit
 * while the business can take money online; otherwise none when its rules
 * allow paying at the desk, or the deposit as it is when they allow only
 * online (the booking is then refused with "get in touch"). The row is
 * never changed.
 */
export async function asBookable<
    T extends Pick<Service, "organizationId" | "depositMode">,
>(service: T, rules: Pick<BookingRulesValue, "bookingPayment">): Promise<T> {
    if (service.depositMode === "NONE") return service;
    if ((await onlinePaymentBlocker(service.organizationId)) === null) {
        return service;
    }
    return allowsDesk(rules) ? { ...service, depositMode: "NONE" } : service;
}
