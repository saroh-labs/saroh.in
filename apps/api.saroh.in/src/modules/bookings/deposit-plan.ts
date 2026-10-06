import type { Service } from "@saroh/database";

import {
    assertPlanTakesOnlinePayment,
    planTakesOnlinePayment,
} from "../billing/online-payments-plan";

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
 * - **Booking** never becomes impossible: on a plan without online
 *   payments a service that keeps a stored deposit books exactly like a
 *   service that takes none — pay at the desk, no deposit offered. The
 *   stored `depositMode` is kept, so it comes back on an upgrade.
 *
 * Both ask `planTakesOnlinePayment`, behind `PLAN_ENFORCEMENT` and failing
 * open (a plan that can't be read takes the deposit as today). Staff
 * bookings never ask: the desk takes a deposit or not as staff say.
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
 * The service as the booking page books it: its stored deposit while the
 * plan takes money online, else none (the row itself is never changed).
 */
export async function asBookedOnPlan<
    T extends Pick<Service, "organizationId" | "depositMode">,
>(service: T): Promise<T> {
    if (service.depositMode === "NONE") return service;
    if (await planTakesOnlinePayment(service.organizationId)) return service;
    return { ...service, depositMode: "NONE" };
}
