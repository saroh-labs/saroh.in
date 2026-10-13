import type { Catalog } from "@saroh/pricing-catalog";
import { addonOfferedOn } from "@saroh/pricing-catalog";

import type { ChangeKind } from "./checkout-quote";
import { addonProblem } from "./offers";

/**
 * Which add-ons a change of plan ends (DEC-157), as pure rules the change
 * itself and its quote share: the webhook and the move end what these say,
 * and the quote names the same ones before the business confirms.
 */

/** An add-on a subscription holds, and how many. */
export interface HeldAddon {
    addonId: string;
    quantity: number;
}

/**
 * The held add-ons a plan isn't offered: the ones that end when the
 * subscription is on that plan. One the plan's version doesn't have at all
 * is not among them (it is left held, and inert).
 */
export function addonsNotOffered<T extends { addonId: string }>(
    catalog: Catalog,
    planId: string,
    held: readonly T[],
): T[] {
    return held.filter((h) => {
        const addon = catalog.addons.find((a) => a.id === h.addonId);
        return addon !== undefined && !addonOfferedOn(addon, planId);
    });
}

/**
 * A completed checkout that starts with no add-ons at all: a new plan (a
 * dearer one chosen during the first month included, DEC-159), or a trial
 * that isn't another plan chosen while a trial runs (U16; quoted only
 * before DEC-159).
 */
export function checkoutClearsAddons(
    kind: string,
    continuingTrial: boolean,
): boolean {
    return kind === "NEW" || (kind === "TRIAL" && !continuingTrial);
}

/** An add-on that ends with a change, as the quote names it. */
export interface EndingAddon {
    id: string;
    name: string;
    /** How many the business holds today. */
    quantity: number;
    /**
     * The new plan's own add-on of the same kind, by name, when it can be
     * added there after the change; null when there is none. Never bought
     * for the business.
     */
    onNewPlan: string | null;
}

/**
 * The add-ons a business holds today that a change would end. Only what
 * counts today is named: one its own plan isn't offered already adds
 * nothing. Free and a checkout that starts afresh end them all; any other
 * change ends the ones the new plan isn't offered.
 */
export function addonsEndingWith(input: {
    kind: ChangeKind;
    /** A trial runs at the provider: another plan's trial keeps its add-ons. */
    trialing: boolean;
    held: readonly HeldAddon[];
    /** The plan it is on, in its own version's catalogue. */
    current: { catalog: Catalog; planId: string } | null;
    /** The plan it would be on; `paid` false is a free plan. */
    target: { catalog: Catalog; planId: string; paid: boolean } | null;
}): EndingAddon[] {
    const { kind, current, target } = input;
    if (kind === "NONE" || !current) return [];
    const today = input.held.flatMap((h) => {
        const addon = current.catalog.addons.find((a) => a.id === h.addonId);
        return addon && h.quantity > 0 && addonOfferedOn(addon, current.planId)
            ? [{ ...h, addon }]
            : [];
    });
    const all =
        kind === "TO_FREE" || checkoutClearsAddons(kind, input.trialing);
    const ending = all
        ? today
        : target
          ? addonsNotOffered(target.catalog, target.planId, today)
          : [];
    return ending.map(({ addon, quantity }) => ({
        id: addon.id,
        name: addon.name,
        quantity,
        onNewPlan:
            (target?.paid
                ? target.catalog.addons.find(
                      (a) =>
                          a.kind === addon.kind &&
                          a.module === addon.module &&
                          addonProblem(target.catalog, target.planId, a, 1) ===
                              null,
                  )?.name
                : null) ?? null,
    }));
}
