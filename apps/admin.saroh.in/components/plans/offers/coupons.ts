import type { Plan } from "@saroh/pricing-catalog";

import type { AdminCoupon, CouponInput } from "@/lib/pricing-types";

import { paiseToRupees, rupeesToPaise } from "./money";

/**
 * A coupon as the Offers tab edits it (plans catalogue U9). Coupons sit
 * outside versions: a save applies at once, so the form checks what the API
 * would refuse before the operator is asked for a reason, and a refusal that
 * names a field (`details.field`) is shown beside that field.
 */

/** The API's own rule for a code people type at checkout. */
export const COUPON_CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const COUPON_MONTHS_MAX = 36;
export const COUPON_USES_MAX = 1_000_000;

export type CouponField =
    | "code"
    | "discountPaise"
    | "months"
    | "planIds"
    | "maxRedemptions"
    | "expiresAt";

const FIELDS: readonly CouponField[] = [
    "code",
    "discountPaise",
    "months",
    "planIds",
    "maxRedemptions",
    "expiresAt",
];

export interface CouponForm {
    code: string;
    /** Rupees off a month, as typed. */
    off: string;
    months: string;
    planIds: string[];
    maxUses: string;
    /** The last day it works, or null for no expiry. */
    expires: Date | null;
}

export type CouponErrors = Partial<Record<CouponField, string>>;

/** A new coupon: every paid plan, for the first month, no amount yet. */
export function blankCoupon(plans: readonly Plan[]): CouponForm {
    return {
        code: "",
        off: "",
        months: "1",
        planIds: plans.map((p) => p.id),
        maxUses: "",
        expires: null,
    };
}

export function formOf(coupon: AdminCoupon): CouponForm {
    return {
        code: coupon.code,
        off: paiseToRupees(coupon.discountPaise),
        months: String(coupon.months),
        planIds: [...coupon.planIds],
        maxUses: String(coupon.maxRedemptions),
        expires: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
    };
}

/** Codes are upper-case with no spaces, as the API stores them. */
export function normaliseCode(text: string): string {
    return text.toUpperCase().replace(/\s/g, "");
}

/** The end of the picked day, in the operator's time: it works all that day. */
export function endOfDay(day: Date): Date {
    const d = new Date(day);
    d.setHours(23, 59, 59, 999);
    return d;
}

function whole(text: string, min: number, max: number): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const n = Number(text.trim());
    return n >= min && n <= max ? n : null;
}

/**
 * The form checked as the API would check it. `plans` are the live
 * catalogue's paid plans (a coupon applies to live pricing). An expiry that
 * hasn't changed may have passed already; a new one must be ahead.
 */
export function checkCoupon(
    form: CouponForm,
    opts: {
        isNew: boolean;
        plans: readonly Plan[];
        now: Date;
        /** The saved expiry, so an unchanged past one isn't refused. */
        savedExpiresAt?: string | null;
        /** Uses so far: max uses can't go under them. */
        uses?: number;
    },
): { input: CouponInput | null; errors: CouponErrors } {
    const errors: CouponErrors = {};
    const code = normaliseCode(form.code);
    if (opts.isNew && !COUPON_CODE.test(code)) {
        errors.code =
            "Use 3 to 32 letters, digits or dashes, starting with a letter or digit";
    }
    const discountPaise = rupeesToPaise(form.off);
    if (discountPaise === null || discountPaise < 1) {
        errors.discountPaise = "Enter an amount off each month";
    }
    const months = whole(form.months, 1, COUPON_MONTHS_MAX);
    if (months === null) {
        errors.months = `Between 1 and ${COUPON_MONTHS_MAX} months`;
    }
    if (form.planIds.length === 0) {
        errors.planIds = "Pick at least one plan";
    } else if (discountPaise !== null && !errors.discountPaise) {
        const over = opts.plans.find(
            (p) => form.planIds.includes(p.id) && discountPaise > p.pricePaise,
        );
        if (over) {
            errors.discountPaise = `The discount is more than ${over.name} costs a month.`;
        }
    }
    const maxRedemptions = whole(form.maxUses, 1, COUPON_USES_MAX);
    if (maxRedemptions === null) {
        errors.maxRedemptions = "How many businesses can use it";
    } else if (opts.uses && maxRedemptions < opts.uses) {
        errors.maxRedemptions = `${opts.uses} businesses have used it already`;
    }
    const expiresAt = form.expires
        ? endOfDay(form.expires).toISOString()
        : null;
    const expiryChanged =
        opts.isNew ||
        (expiresAt?.slice(0, 10) ?? null) !==
            (opts.savedExpiresAt?.slice(0, 10) ?? null);
    if (
        expiryChanged &&
        form.expires &&
        endOfDay(form.expires).getTime() <= opts.now.getTime()
    ) {
        errors.expiresAt = "Pick an expiry date that hasn't passed.";
    }
    if (
        Object.keys(errors).length > 0 ||
        discountPaise === null ||
        months === null ||
        maxRedemptions === null
    ) {
        return { input: null, errors };
    }
    return {
        input: {
            code,
            discountPaise,
            months,
            planIds: form.planIds,
            maxRedemptions,
            expiresAt,
        },
        errors,
    };
}

/** What a save of an existing coupon sends: only what changed. */
export function couponChanges(
    coupon: AdminCoupon,
    input: CouponInput,
): Partial<Omit<CouponInput, "code">> {
    const out: Partial<Omit<CouponInput, "code">> = {};
    if (input.discountPaise !== coupon.discountPaise) {
        out.discountPaise = input.discountPaise;
    }
    if (input.months !== coupon.months) out.months = input.months;
    if (
        [...input.planIds].sort().join() !== [...coupon.planIds].sort().join()
    ) {
        out.planIds = input.planIds;
    }
    if (input.maxRedemptions !== coupon.maxRedemptions) {
        out.maxRedemptions = input.maxRedemptions;
    }
    const was = coupon.expiresAt?.slice(0, 10) ?? null;
    const now = input.expiresAt?.slice(0, 10) ?? null;
    if (was !== now) out.expiresAt = input.expiresAt ?? null;
    return out;
}

/** The field a refusal names (`details.field`), if it is one of the form's. */
export function refusedField(details: unknown): CouponField | null {
    if (!details || typeof details !== "object") return null;
    const field = (details as { field?: unknown }).field;
    return typeof field === "string" &&
        (FIELDS as readonly string[]).includes(field)
        ? (field as CouponField)
        : null;
}

export function usesText(uses: number): string {
    if (uses === 0) return "Not used yet";
    return `Used ${uses} ${uses === 1 ? "time" : "times"}`;
}
