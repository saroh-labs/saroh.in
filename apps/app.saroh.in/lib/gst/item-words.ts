import { formatMoney } from "@/lib/format/money";
import { isHsnSac, rateOption } from "@/lib/invoices/gst";

import type { GstPriceMode, ItemModeValue, PriceTerms } from "./price-mode";
import {
    effectiveMode,
    isGstPriceMode,
    ITEM_MODE_LABEL,
    rateBps,
    unitPayCents,
} from "./price-mode";

/**
 * The GST a membership plan, a class pack and a course carry (12 Oct 2026),
 * as their editors, their histories and their desk dialogs say it. Pure and
 * client-safe.
 *
 * Each has a GST rate ("18"; none is "not set"; "0" is exempt, a choice of
 * its own), an optional SAC code, and its own way of carrying GST where
 * that differs from the business's ("same as the business" otherwise): the
 * same three a service has, by the same rules.
 */

/** The three GST fields as an editor's form holds them: "" is not set. */
export interface GstForm {
    gstRate: string;
    sacCode: string;
    /** "" is the same as the business. */
    gstPriceMode: ItemModeValue;
}

/** The three as the API takes and serves them: null is not set. */
export interface GstValues {
    gstRate: string | null;
    sacCode: string | null;
    gstPriceMode: GstPriceMode | null;
}

/** What the page knows of the business: whether it is asked, and its way. */
export interface GstAsk {
    /** A GST-registered business: a priced one needs a rate. */
    asked: boolean;
    /** How the business's prices carry GST; null when it couldn't be told. */
    priceMode: GstPriceMode | null;
}

/** Nothing is asked: not registered, or it couldn't be told. */
export const NOT_ASKED: GstAsk = { asked: false, priceMode: null };

/** What a SAC code that isn't one is told. */
export const SAC_SHAPE_PROBLEM = "A SAC code is 4 to 8 digits.";

/**
 * A field's problem as the editor shell takes one: it ends the sentence
 * itself ("1 thing to fix before publishing: add the price."), so the
 * message comes without its full stop, as "Add the price" does.
 */
export function shellProblem(message: string): string {
    return message.replace(/\.$/, "");
}

/** A typed SAC code with its spaces gone. */
export function tidySac(typed: string | null | undefined): string {
    return (typed ?? "").replace(/\s+/g, "");
}

/** Whether a typed SAC code can be saved: empty, or four to eight digits. */
export function sacOk(typed: string | null | undefined): boolean {
    const sac = tidySac(typed);
    return sac === "" || isHsnSac(sac);
}

/** A stored rate as words: "18%", "0.25%", or "not set". */
export function rateSays(rate: unknown): string {
    const option = typeof rate === "string" ? rateOption(rate) : "";
    return option === "" ? "not set" : `${option}%`;
}

/** A stored item mode as words; none is the business's own way. */
export function modeSays(mode: unknown): string {
    if (!isGstPriceMode(mode)) return "same as the business";
    return mode === "ADDED" ? "GST is added" : "includes GST";
}

/** A stored SAC code as words. */
export function sacSays(code: unknown): string {
    return typeof code === "string" && code.trim() ? code.trim() : "not set";
}

const sameRate = (a: unknown, b: unknown) => rateSays(a) === rateSays(b);
const sameMode = (a: unknown, b: unknown) => modeSays(a) === modeSays(b);
const sameSac = (a: unknown, b: unknown) => sacSays(a) === sacSays(b);

/**
 * "When you publish", one line per GST field that differs, in the editors'
 * own form ("price ₹1,500 → ₹1,800").
 */
export function gstChangeLines(
    before: Partial<Record<keyof GstForm, unknown>>,
    after: Partial<Record<keyof GstForm, unknown>>,
): string[] {
    const out: string[] = [];
    if (!sameRate(before.gstRate, after.gstRate)) {
        out.push(
            `GST rate ${rateSays(before.gstRate)} → ${rateSays(after.gstRate)}`,
        );
    }
    if (!sameMode(before.gstPriceMode, after.gstPriceMode)) {
        out.push(`${ITEM_MODE_LABEL}: ${modeSays(after.gstPriceMode)}`);
    }
    if (!sameSac(before.sacCode, after.sacCode)) {
        out.push(
            `SAC code ${sacSays(before.sacCode)} → ${sacSays(after.sacCode)}`,
        );
    }
    return out;
}

/**
 * A history's sentences for a GST change, each after the person's name:
 * "changed the GST rate from not set to 18%", "changed GST on this price to
 * GST is added", "changed the SAC code from not set to 999723". `changes`
 * holds `[before, after]` per field, as the API records them; a field that
 * isn't there, or didn't move, says nothing.
 */
export function gstHistoryLines(
    changes: Partial<Record<keyof GstForm, unknown>>,
): string[] {
    const pair = (value: unknown): [unknown, unknown] | null =>
        Array.isArray(value) && value.length >= 2
            ? [value[0] as unknown, value[1] as unknown]
            : null;
    const out: string[] = [];
    const rate = pair(changes.gstRate);
    if (rate && !sameRate(rate[0], rate[1])) {
        out.push(
            `changed the GST rate from ${rateSays(rate[0])} to ${rateSays(rate[1])}`,
        );
    }
    const mode = pair(changes.gstPriceMode);
    if (mode && !sameMode(mode[0], mode[1])) {
        out.push(`changed ${ITEM_MODE_LABEL} to ${modeSays(mode[1])}`);
    }
    const sac = pair(changes.sacCode);
    if (sac && !sameSac(sac[0], sac[1])) {
        out.push(
            `changed the SAC code from ${sacSays(sac[0])} to ${sacSays(sac[1])}`,
        );
    }
    return out;
}

/**
 * One GST field of a pack's activity, in that list's own form ("price
 * ₹1,500, was ₹1,200"): "GST rate 18%, was not set", "GST on this price:
 * GST is added", "SAC code 999723, was not set". Null for any other field,
 * or one that didn't move.
 */
export function gstActivityWords(
    field: string,
    was: unknown,
    now: unknown,
): string | null {
    switch (field) {
        case "gstRate":
            return sameRate(was, now)
                ? null
                : `GST rate ${rateSays(now)}, was ${rateSays(was)}`;
        case "gstPriceMode":
            return sameMode(was, now)
                ? null
                : `${ITEM_MODE_LABEL}: ${modeSays(now)}`;
        case "sacCode":
            return sameSac(was, now)
                ? null
                : `SAC code ${sacSays(now)}, was ${sacSays(was)}`;
        default:
            return null;
    }
}

/* ── What a desk dialog says it will charge ────────────────────────── */

/** "2000.50" as 200050: whole minor units, never a float sum. */
export function typedCents(amount: string | null | undefined): number | null {
    const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec((amount ?? "").trim());
    if (!match) return null;
    const [, whole = "0", frac = ""] = match;
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** The amount to pay for a typed price, and the GST in it, when GST is added. */
export interface AddedGst {
    listCents: number;
    gstCents: number;
    payCents: number;
    /** "18", as the rate is written. */
    rate: string;
}

/**
 * What "GST is added" does to a typed price: the price, the GST on top and
 * the amount to pay, by the preview mirror (`unitPayCents`). Null whenever
 * the typed price is the amount to pay: a business that isn't registered or
 * couldn't be read, no rate, an exempt one, or a price that includes GST.
 * A preview only: the invoice the API writes is the truth.
 */
export function addedGst(
    typed: string | null | undefined,
    item: { gstRate?: string | null; gstPriceMode?: string | null },
    business: GstAsk | null | undefined,
): AddedGst | null {
    const listCents = typedCents(typed);
    if (listCents === null || listCents <= 0 || !business?.asked) return null;
    const bps = rateBps(item.gstRate);
    if (bps === null || bps <= 0) return null;
    // The item's own way, else the business's; neither known says nothing.
    if (business.priceMode === null && !isGstPriceMode(item.gstPriceMode)) {
        return null;
    }
    const terms: PriceTerms = {
        registered: true,
        mode: effectiveMode(business.priceMode, item.gstPriceMode),
    };
    if (terms.mode !== "ADDED") return null;
    const payCents = unitPayCents(
        listCents,
        item.gstRate,
        terms.mode,
        terms.registered,
    );
    return {
        listCents,
        gstCents: payCents - listCents,
        payCents,
        rate: rateOption(item.gstRate) || String(bps / 100),
    };
}

/** "₹5,000 + ₹900 GST (18%) = ₹5,900 to pay". */
export function addedGstWords(
    added: AddedGst,
    currency: string | null | undefined,
): string {
    const money = (cents: number) => formatMoney(cents, currency);
    return `${money(added.listCents)} + ${money(added.gstCents)} GST (${added.rate}%) = ${money(added.payCents)} to pay`;
}
