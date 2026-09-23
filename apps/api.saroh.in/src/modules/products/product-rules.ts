import { BadRequestException } from "@nestjs/common";

import { SHOP_FIELDS } from "./dto";

/**
 * The product's own rules, pure so the unit project can pin them without a
 * database. Money arrives as the DTO-checked decimal string ("799", "24.50")
 * and is compared in integer minor units — never as a float.
 */

export function moneyToCents(amount: string): number {
    const [whole, frac = ""] = amount.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/**
 * An MRP is the printed price customers compare against, so it can never be
 * below what the product sells for. Equal is allowed: a product sold at MRP.
 */
export function assertMrpAtOrAbovePrice(
    price: string,
    mrp: string | null,
    field = "mrp",
): void {
    if (mrp === null) return;
    if (moneyToCents(mrp) < moneyToCents(price)) {
        throw new BadRequestException({
            message: "MRP can't be lower than the price it sells for.",
            field,
        });
    }
}

/**
 * The saving customers see beside a struck-through MRP, in whole percent,
 * rounded DOWN so the shop never claims more off than there is. `null` when
 * there is nothing to show (no MRP, or sold at MRP).
 */
export function savingPercent(
    price: string,
    mrp: string | null,
): number | null {
    if (mrp === null) return null;
    const p = moneyToCents(price);
    const m = moneyToCents(mrp);
    if (m <= p || m === 0) return null;
    return Math.floor(((m - p) * 100) / m);
}

/**
 * The switches a merchant flips per field. Only known keys, only booleans:
 * a typo can never create a field, and a non-boolean can never be read as
 * "shown". Returns the cleaned object to store.
 */
export function cleanShopFields(
    input: Record<string, unknown>,
): Record<string, boolean> {
    const known = new Set<string>(SHOP_FIELDS);
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(input)) {
        if (!known.has(key)) {
            throw new BadRequestException({
                message: `Unknown shop field "${key}"`,
                field: "shopFields",
            });
        }
        if (typeof value !== "boolean") {
            throw new BadRequestException({
                message: `"${key}" must be on or off`,
                field: "shopFields",
            });
        }
        out[key] = value;
    }
    return out;
}

export interface DetailsState {
    madeHere: boolean;
    maker: string | null;
    returnsMode: string;
    returnsText: string | null;
}

/**
 * The Made by and Returns choices have to be answerable once saved: someone
 * else made it → say who; its own returns rule → write it. Checked on the
 * state AFTER the patch, so a save that only flips the mode is judged against
 * the text already stored.
 */
export function assertDetailsCoherent(state: DetailsState): void {
    if (!state.madeHere && !state.maker) {
        throw new BadRequestException({
            message: "Add who makes it, or switch back to Made here.",
            field: "maker",
        });
    }
    if (state.returnsMode === "OWN" && !state.returnsText) {
        throw new BadRequestException({
            message:
                "Write this product's returns rule, or use the storefront's.",
            field: "returnsText",
        });
    }
}
