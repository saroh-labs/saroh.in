import { assertPlanTakesOnlinePayment } from "../billing/online-payments-plan";

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
 *   (`onlinePaymentBlocker`, whose first reason is the plan), follows the
 *   business's "How people pay when they book" (DEC-089,
 *   `depositPaidAtDesk` in `booking-payment.ts`): Both or At the desk — the
 *   deposit is paid at the desk; Online only — the booking page says to get
 *   in touch. The stored `depositMode` is never changed.
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
