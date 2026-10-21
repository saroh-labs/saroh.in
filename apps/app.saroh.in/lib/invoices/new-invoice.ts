import type { PaperStyle } from "@saroh/block-contract";
import { PAPER_STYLES } from "@saroh/block-contract";
import { z } from "zod";

import { isTimeZone, zoneParts } from "@/lib/format/datetime";
import { minorOf } from "@/lib/format/money";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import type {
    BusinessLogo,
    TaxSettings,
} from "@/lib/organizations/settings-service";

import { GST_STATES, GSTIN_SHAPE, isHsnSac } from "./gst";
import { defaultNumberFormat, nextInvoiceNumber } from "./invoice-number";
import type { InvoiceInput } from "./service";

/**
 * New invoice (A), DEC-173 U14 #1126: the form's rules, pure. What is
 * checked, what a save sends, when it falls due, the place of supply and
 * its tax, and the next number. A product as a line and the preview's
 * figures are `new-invoice-lines.ts`. Nothing here is sent as a figure: the
 * API prices the invoice, and issuing freezes what it worked out.
 */

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/** When it falls due, as the design offers it: days after today. */
export const DUES = [
    { days: 0, label: "On receipt" },
    { days: 7, label: "7 days" },
    { days: 14, label: "14 days" },
    { days: 30, label: "30 days" },
] as const;

export const invoiceFormSchema = z.object({
    contactId: z.string().min(1, { message: "Choose who it's for" }),
    /** Days from today, or "kept" for a draft's own due date. */
    due: z.union([z.number(), z.literal("kept")]),
    billToGstin: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === "" || GSTIN_SHAPE.test(v), {
            message: "A GSTIN is 15 characters, like 29AAGCR4375J1ZU",
        }),
    billToState: z.string(),
    billToAddress: z.string().trim().max(500),
    lines: z
        .array(
            z.object({
                description: z
                    .string()
                    .trim()
                    .min(1, { message: "Say what it's for" })
                    .max(200),
                quantity: z
                    .number({ message: "A whole number" })
                    .int({ message: "A whole number" })
                    .min(1, { message: "At least 1" })
                    .max(9999),
                unitPrice: z.string().trim().regex(MONEY, {
                    message: "A price, with at most two decimals",
                }),
                gstRate: z.string(),
                hsnSac: z
                    .string()
                    .trim()
                    .refine((v) => v === "" || isHsnSac(v), {
                        message: "An HSN or SAC is 4 to 8 digits",
                    }),
            }),
        )
        .min(1, { message: "Add a line" }),
    /**
     * The draft's own look (DEC-173, U15 #1127): "" follows the business's
     * default. Left out (a form that never offers it), nothing is sent.
     */
    paperStyle: z.enum(["", ...PAPER_STYLES]).optional(),
    /** `#RRGGBB`, or "" to follow the business's colour. */
    paperColour: z
        .string()
        .refine((v) => v === "" || /^#[0-9A-Fa-f]{6}$/.test(v), {
            message: "A colour is # and six letters or digits, like #6B3F1D",
        })
        .optional(),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
export type InvoiceFormLine = InvoiceFormValues["lines"][number];

export const EMPTY_LINE: InvoiceFormLine = {
    description: "",
    quantity: 1,
    unitPrice: "",
    gstRate: "",
    hsnSac: "",
};

/** A typed price in minor units; 0 for anything that isn't one yet. */
export function centsOf(typed: string | undefined): number {
    const t = (typed ?? "").trim();
    // A box takes up to nine digits and no sign; what it holds is read as
    // every amount is (`minorOf`).
    if (!MONEY.test(t)) return 0;
    return minorOf(t) ?? 0;
}

/** Minor units as a price box holds them: "400", "220.5" → "220.50". */
export function priceOf(cents: number): string {
    const whole = Math.floor(cents / 100);
    const frac = cents % 100;
    return frac === 0
        ? String(whole)
        : `${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * The end of the day `days` from `now`, so "due 15 Sep" is overdue from the
 * 16th: in the business's zone, where the paper dates it, else the
 * browser's.
 */
export function dueFrom(
    days: number,
    now: Date = new Date(),
    zone?: string | null,
): string {
    if (!zone || !isTimeZone(zone)) {
        return new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + days,
            23,
            59,
            59,
        ).toISOString();
    }
    const today = zoneParts(now, zone);
    // That wall-clock time read as UTC, then moved by the zone's offset.
    const guess = Date.UTC(
        today.year,
        today.month - 1,
        today.day + days,
        23,
        59,
        59,
    );
    const w = zoneParts(guess, zone);
    const wall = Date.UTC(
        w.year,
        w.month - 1,
        w.day,
        w.hour,
        w.minute,
        w.second,
    );
    return new Date(guess - (wall - guess)).toISOString();
}

/** When the form says it falls due: a chip's day, or the draft's own. */
export function dueAtOf(
    due: InvoiceFormValues["due"],
    draftDueAt: string | null | undefined,
    now: Date = new Date(),
    zone?: string | null,
): string | null {
    return due === "kept" ? (draftDueAt ?? null) : dueFrom(due, now, zone);
}

/** A line that counts: something it's for, a quantity and a price. */
export function isGoodLine(l: InvoiceFormLine): boolean {
    return (
        l.description.trim() !== "" &&
        Number(l.quantity) > 0 &&
        centsOf(l.unitPrice) > 0
    );
}

/** What a save sends, the same for the first save and every one after. */
export function draftInput(
    values: InvoiceFormValues,
    ctx: {
        registered: boolean;
        currency: string;
        /** A draft already exists: no currency or typed tax again. */
        saved: boolean;
        draftDueAt?: string | null;
        now?: Date;
        /** The business's zone, which the due day is the end of. */
        zone?: string | null;
    },
): InvoiceInput {
    return {
        contactId: values.contactId,
        ...(ctx.saved ? {} : { currency: ctx.currency, tax: "0" }),
        dueAt: dueAtOf(values.due, ctx.draftDueAt, ctx.now, ctx.zone),
        lines: values.lines.map((l) => ({
            description: l.description.trim(),
            quantity: l.quantity,
            unitPrice: l.unitPrice.trim(),
            ...(ctx.registered && l.gstRate ? { gstRate: l.gstRate } : {}),
            ...(ctx.registered && l.hsnSac.trim()
                ? { hsnSac: l.hsnSac.replace(/\s+/g, "") }
                : {}),
        })),
        ...(ctx.registered
            ? {
                  billToGstin: values.billToGstin.trim().toUpperCase(),
                  billToState: values.billToState,
                  billToAddress: values.billToAddress.trim(),
              }
            : {}),
        // The draft's own look, "" back to the business's (U15 #1127).
        ...(values.paperStyle !== undefined
            ? { paperStyle: values.paperStyle }
            : {}),
        ...(values.paperColour !== undefined
            ? { paperColour: values.paperColour.toUpperCase() }
            : {}),
    };
}

/* The place of supply ------------------------------------------------- */

export interface Place {
    code: string;
    name: string;
}

/** A GST state by its code: "29" → Karnataka. Null for anything else. */
export function stateNamed(code: string | null | undefined): Place | null {
    const hit = GST_STATES.find((s) => s.value === code);
    return hit ? { code: hit.value, name: hit.label } : null;
}

/**
 * Where the supply is, as the API works it out (`placeOfSupply`): the
 * buyer's state when chosen, else the state their GSTIN carries, else the
 * business's own.
 */
export function placeOf(
    buyer: { billToGstin: string; billToState: string },
    businessState: string | null,
): Place | null {
    const gstin = buyer.billToGstin.trim().toUpperCase();
    return (
        stateNamed(buyer.billToState) ??
        (GSTIN_SHAPE.test(gstin) ? stateNamed(gstin.slice(0, 2)) : null) ??
        stateNamed(businessState)
    );
}

/** Another state than the business's is IGST; the same, CGST + SGST. */
export function isInterState(
    place: Place | null,
    businessState: string | null,
): boolean {
    return Boolean(place && businessState && place.code !== businessState);
}

/**
 * The line under who it's billed to (INVNewA): "GSTIN 29ABCFB2207K1ZL ·
 * Karnataka: CGST + SGST". Without a GSTIN, the place alone. Null when no
 * place can be told (the business's own state isn't set).
 */
export function supplyLine(
    buyer: { billToGstin: string; billToState: string },
    businessState: string | null,
): string | null {
    const place = placeOf(buyer, businessState);
    if (!place) return null;
    const gstin = buyer.billToGstin.trim().toUpperCase();
    const tax = isInterState(place, businessState) ? "IGST" : "CGST + SGST";
    const where = `${place.name}: ${tax}`;
    return GSTIN_SHAPE.test(gstin) ? `GSTIN ${gstin} · ${where}` : where;
}

/* The next number ----------------------------------------------------- */

/**
 * The number issuing will give it, from where the business's series stand
 * (the settings read). Null when they couldn't be read: the line then says
 * "the next number" without one. Another invoice issued first takes it,
 * so it is said as what it will be, never promised.
 */
export function nextNumberOf(
    tax: TaxSettings | null | undefined,
    timezone: string | null,
    now: Date = new Date(),
): string | null {
    if (!tax?.invoiceNumber) return null;
    const format = tax.invoiceNumber.custom
        ? tax.invoiceNumber
        : defaultNumberFormat(tax.registered);
    return nextInvoiceNumber(format, {
        prefix: tax.invoicePrefix,
        last: tax.invoiceNumber.counters,
        samePrefix: true,
        now,
        timezone,
    });
}

/** The line under the preview (INVNewA). */
export function issueLine(next: string | null): string {
    return next
        ? `Saved as you type. Issuing gives it the next number, ${next}, and locks the lines.`
        : "Saved as you type. Issuing gives it the next number and locks the lines.";
}

/* The business, as the form and its preview need it ------------------ */

export interface PreviewSeller {
    name: string;
    /** The registered address as it prints; null when not set or unread. */
    address: string | null;
    gstin: string | null;
    /** "Karnataka (29)". */
    state: string | null;
    logo: string | null;
}

/** The business as New invoice needs it, read with the page. */
export interface InvoiceFormBusiness {
    seller: PreviewSeller;
    /** Its GST state code: the place of supply when the buyer's isn't set. */
    state: string | null;
    /** How its prices carry GST, for a product picked; null when unread. */
    priceMode: GstPriceMode | null;
    /** The IANA zone its paper is dated in. */
    zone: string;
    /** The look its invoices go out in when a draft chose none (U6). */
    paper: { style: PaperStyle; colour: string | null };
    /** The number issuing will give, where the series could be read. */
    nextNumber: string | null;
    /**
     * "How to pay us" as unpaid paper prints it (#833), the notes the paper
     * carries; null when nothing is set. Absent: none.
     */
    howToPay?: string[] | null;
    /**
     * What the paper's editors change for the whole business, in place
     * (U15): the logo and How to pay us as saved. Absent: not offered.
     */
    logoFile?: BusinessLogo | null;
    pay?: PayInstructionsSettings;
}
