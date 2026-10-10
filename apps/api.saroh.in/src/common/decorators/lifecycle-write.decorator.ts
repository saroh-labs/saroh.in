import { SetMetadata } from "@nestjs/common";

import type { LifecycleWriteClass } from "../../modules/organizations/organization-lifecycle.policy";

export const LIFECYCLE_WRITE_KEY = "lifecycle:write";

/**
 * What a write route does to a business, for its lifecycle (owner, 9 Oct,
 * DEC-120): `wind-down` finishes, cancels or refunds something already
 * started, or takes money already owed for it; `takeout` is the business
 * taking its own data away. A route that names none is `new`, and a
 * business that is closing (`PENDING_DELETION`) or suspended refuses it.
 *
 * Read by `OrganizationGuard` and `StoreLifecycleGuard`;
 * `organizations/lifecycle-wind-down.spec.ts` names every write route in
 * the order, booking, refund, membership, class pack and course
 * controllers as wind-down or new, so a new one is a decision.
 */
export const LifecycleWrite = (
    writeClass: Exclude<LifecycleWriteClass, "new">,
) => SetMetadata(LIFECYCLE_WRITE_KEY, writeClass);
