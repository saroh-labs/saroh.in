/**
 * The refusals plan enforcement gives (plans catalogue U13, KTD-9). Each is
 * the API's usual error envelope with a stable `details.code` the merchant
 * app branches on (U14 renders the limit notice from `details.notice`, never
 * the raw message in a toast):
 *
 * - `PLAN_LIMIT_REACHED` (403): one more would pass the plan's cap. Existing
 *   things stay readable and editable; only adding is refused.
 * - `MODULE_LOCKED` (403): the business's plan leaves the row off.
 * - `BOOKINGS_PAUSED` (409): the booking page at the monthly cap. Said to a
 *   customer, so it names no plan, limit or price; the merchant hears why
 *   from their limit notice. Refused before any payment is taken.
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { LimitPeriod, ModuleAccess } from "@saroh/pricing-catalog";
import { limitNotice } from "@saroh/pricing-catalog";

import type { MeteredLimitKey } from "./metering";
import { METER_WORDS } from "./metering";

export const PLAN_LIMIT_REACHED = "PLAN_LIMIT_REACHED";
export const MODULE_LOCKED = "MODULE_LOCKED";
export const BOOKINGS_PAUSED = "BOOKINGS_PAUSED";

/** Where a refused business could go: the first plan above it with the row. */
export interface UpgradeTo {
    planId: string;
    name: string;
    pricePaise: number;
}

function upgradeOf(row: ModuleAccess): UpgradeTo | null {
    return row.upgradePlanId
        ? {
              planId: row.upgradePlanId,
              name: row.upgradeTo,
              pricePaise: row.upgradePricePaise,
          }
        : null;
}

/** `details` of a `PLAN_LIMIT_REACHED` refusal. */
export interface PlanLimitDetails {
    code: typeof PLAN_LIMIT_REACHED;
    moduleId: string;
    limitKey: MeteredLimitKey;
    limit: number;
    used: number;
    per: LimitPeriod;
    plan: { id: string; name: string };
    upgradeTo: UpgradeTo | null;
    /** The design's 100% notice, ready to show (`limitNotice`). */
    notice: { title: string; body: string; cta: string };
}

/** 403: adding one more would pass the plan's cap on this row. */
export function planLimitReached(
    row: ModuleAccess,
    key: MeteredLimitKey,
    limit: number,
    used: number,
): ForbiddenException {
    const words = METER_WORDS[key];
    const n = limitNotice(
        {
            inc: true,
            limit,
            plan: row.plan,
            upgradeTo: row.upgradeTo,
            upgradeUncapped: row.upgradeUncapped,
        },
        Math.max(used, limit),
        words.what,
        words.paused,
    );
    const notice = n.on
        ? { title: n.title, body: n.body, cta: n.cta }
        : {
              title: `You've reached your ${words.what} limit on ${row.plan}`,
              body: words.paused,
              cta: "Add more",
          };
    const details: PlanLimitDetails = {
        code: PLAN_LIMIT_REACHED,
        moduleId: row.moduleId,
        limitKey: key,
        limit,
        used,
        per: row.per,
        plan: { id: row.planId, name: row.plan },
        upgradeTo: upgradeOf(row),
        notice,
    };
    return new ForbiddenException({ message: notice.title, details });
}

/** `details` of a `MODULE_LOCKED` refusal. */
export interface ModuleLockedDetails {
    code: typeof MODULE_LOCKED;
    moduleId: string;
    plan: { id: string; name: string };
    upgradeTo: UpgradeTo | null;
}

/** 403: the business's plan leaves this row off. */
export function moduleLocked(row: ModuleAccess): ForbiddenException {
    const up = upgradeOf(row);
    const details: ModuleLockedDetails = {
        code: MODULE_LOCKED,
        moduleId: row.moduleId,
        plan: { id: row.planId, name: row.plan },
        upgradeTo: up,
    };
    return new ForbiddenException({
        message: up
            ? `${row.name} isn't in your ${row.plan} plan. It comes with ${up.name}.`
            : `${row.name} isn't in your ${row.plan} plan.`,
        details,
    });
}

export const BOOKINGS_PAUSED_MESSAGE =
    "This business isn't taking bookings online right now.";

/** 409 on the booking page at the monthly cap (U13; no money taken yet). */
export function bookingsPaused(): ConflictException {
    return new ConflictException({
        message: BOOKINGS_PAUSED_MESSAGE,
        details: { code: BOOKINGS_PAUSED, reason: "bookingsPaused" },
    });
}
