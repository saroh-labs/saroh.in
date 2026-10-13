/**
 * Caps inside one thing, not across the business (plans catalogue,
 * DEC-158): how many variants one product may have. The catalogue row says
 * it is one (`MODULE_MAP[row].within`); its cell's `limit` is the cap, and
 * a per-business `limit` or `raise` override moves it as any limit.
 *
 * They are not metered (`metering.ts`): there is no count across the
 * business, so `usageByModule` leaves the row out and nothing built on it
 * (`GET …/billing/access`'s `usage`, the admin's usage lines and impact,
 * the 80% / 100% notices, "over" after a move down) ever names it. The one
 * thing that happens is here: a write that would take one thing past its
 * cap is refused, with the plan-limit refusal the app already shows.
 *
 * | Limit key            | Capped inside | Counts                      |
 * | -------------------- | ------------- | --------------------------- |
 * | `variantsPerProduct` | a product     | the product's variants, all |
 *
 * Nothing is ever taken away. A thing already past its cap (made before
 * the cap, or after a move to a lower plan) stays as it is and can be
 * changed in every way but one: it can't get more while it is past the cap.
 *
 * The row is a limit and never a lock: a cell that leaves it out, like a
 * version with no such row, caps nothing.
 */
import { ForbiddenException } from "@nestjs/common";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import {
    itemLimitNotice,
    LIMIT_WORDS,
    limitWithin,
    MODULE_MAP,
} from "@saroh/pricing-catalog";

import type { ItemLimitKey } from "./metering";
import { ITEM_LIMIT_KEYS } from "./metering";
import type { PlanLimitDetails } from "./plan-limit-errors";
import { PLAN_LIMIT_REACHED, upgradeOf } from "./plan-limit-errors";

const ITEM: ReadonlySet<string> = new Set(ITEM_LIMIT_KEYS);

/** A catalogue row's per-item limit key, or null for any other row. */
export function itemKeyOf(moduleId: string): ItemLimitKey | null {
    if (!limitWithin(moduleId)) return null;
    const key = MODULE_MAP[moduleId].limitKey;
    return key && ITEM.has(key) ? (key as ItemLimitKey) : null;
}

/** A per-item cap as one business has it now. */
export interface ItemCap {
    row: ModuleAccess;
    key: ItemLimitKey;
    limit: number;
}

/**
 * The cap a resolved row puts on one thing, or null when it puts none: no
 * row (enforcement off, off the catalogue, a version without it), the row
 * left out by the plan, or no limit in its cell.
 */
export function itemCapOf(row: ModuleAccess | null): ItemCap | null {
    if (row?.state !== "on" || row.limit === null) return null;
    const key = itemKeyOf(row.moduleId);
    return key ? { row, key, limit: row.limit } : null;
}

/**
 * Refuse (403 `PLAN_LIMIT_REACHED`) a write that adds `adding` to a thing
 * holding `has` when that would pass the cap. Adding nothing always passes,
 * so a thing past its cap can still be saved, renamed and made smaller.
 * `stopped` is the write's own sentence where it isn't an add to the thing
 * in hand (a copy).
 */
export function assertItemRoom(
    cap: ItemCap | null,
    has: number,
    adding: number,
    stopped?: string,
): void {
    if (!cap || adding <= 0) return;
    if (has + adding <= cap.limit) return;
    throw itemLimitReached(cap, has, stopped);
}

/**
 * 403: the write would take one thing past the plan's cap on what it
 * holds. The same `PLAN_LIMIT_REACHED` shape as a count across the
 * business (`plan-limit-errors.ts`), so the app shows its usual notice;
 * the words are the per-item ones (`itemLimitNotice`), which never speak
 * of a total.
 */
export function itemLimitReached(
    cap: ItemCap,
    has: number,
    stopped?: string,
): ForbiddenException {
    const { row, key, limit } = cap;
    const words = LIMIT_WORDS[key];
    const notice = itemLimitNotice(
        { ...row, limit },
        has,
        words.what,
        words.paused,
        stopped,
    ) ?? {
        title: `You've reached your ${words.what} limit on ${row.plan}`,
        body: stopped ?? words.paused,
        cta: "See your plan",
    };
    const details: PlanLimitDetails = {
        code: PLAN_LIMIT_REACHED,
        moduleId: row.moduleId,
        limitKey: key,
        limit,
        used: has,
        per: row.per,
        plan: { id: row.planId, name: row.plan },
        upgradeTo: upgradeOf(row),
        notice,
    };
    return new ForbiddenException({ message: notice.title, details });
}
