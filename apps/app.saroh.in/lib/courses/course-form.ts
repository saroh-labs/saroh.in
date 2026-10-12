import { z } from "zod";

import type { GstAsk, GstValues } from "@/lib/gst/item-words";
import { SAC_SHAPE_PROBLEM, sacOk, tidySac } from "@/lib/gst/item-words";
import { itemModeInput, itemModeValue } from "@/lib/gst/price-mode";
import { GST_RATE_NEEDED, rateOption } from "@/lib/invoices/gst";

import type { CourseInput } from "./service";

/**
 * The course form's rules (pure): what it checks before a save, and what a
 * save sends. The page (`components/courses/course-form.tsx`) draws it.
 *
 * A GST-registered business answers the course's GST beside its price
 * (12 Oct 2026), by the rules a service has: a priced course needs a rate,
 * 0% is a rate for an exempt one, the SAC code is optional, and "GST on
 * this price" is for a course priced differently from the business's own
 * way. A business that isn't registered is shown none of it and sends none
 * of it. The API does not refuse a course saved without a rate, so the form
 * is where it is asked.
 */

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

export const courseSchema = z.object({
    serviceId: z.string().min(1, "Choose the service it runs on"),
    name: z.string().trim().min(1, "Give the course a name").max(120),
    description: z.string().max(1000),
    price: z.string().trim().regex(MONEY, "A price like 240 or 240.50"),
    currency: z.string().regex(/^[A-Z]{3}$/),
    seats: z
        .string()
        .trim()
        .regex(/^\d{1,4}$/, "A whole number of seats")
        .refine((v) => Number(v) >= 1, "At least one seat"),
    /** "" is not chosen; "0" is exempt. */
    gstRate: z.string(),
    sacCode: z.string(),
    /** "" is the same as the business. */
    gstPriceMode: z.enum(["", "INCLUDED", "ADDED"]),
});

export type CourseFormValues = z.infer<typeof courseSchema>;

/**
 * What is wrong with the GST fields, by field: a priced course of a
 * GST-registered business (`asked`) needs a rate, and a SAC code is four to
 * eight digits. Said beside the other fields' problems, in one pass, so
 * nobody fixes a name only to be told about the rate.
 */
export function courseGstProblems(
    values: Pick<CourseFormValues, "price" | "gstRate" | "sacCode">,
    asked: boolean,
): Partial<Record<"gstRate" | "sacCode", string>> {
    if (!asked) return {};
    const out: Partial<Record<"gstRate" | "sacCode", string>> = {};
    const price = values.price.trim();
    if (MONEY.test(price) && Number(price) > 0 && values.gstRate === "") {
        out.gstRate = GST_RATE_NEEDED;
    }
    if (!sacOk(values.sacCode)) out.sacCode = SAC_SHAPE_PROBLEM;
    return out;
}

/** A saved course's GST as the form's fields hold it; a new one has none. */
export function courseGstDefaults(
    course?: Partial<GstValues> | null,
): Pick<CourseFormValues, "gstRate" | "sacCode" | "gstPriceMode"> {
    return {
        gstRate: rateOption(course?.gstRate),
        sacCode: course?.sacCode ?? "",
        gstPriceMode: itemModeValue(course?.gstPriceMode),
    };
}

/**
 * What a save sends. The GST fields go only from a business that was asked
 * for them, as the API takes them: null is "not set" for the rate and the
 * SAC code, and "same as the business" for the way.
 */
export function courseInput(
    values: CourseFormValues,
    gst: Pick<GstAsk, "asked">,
): CourseInput {
    return {
        name: values.name,
        description: values.description.trim() || null,
        price: values.price.trim(),
        currency: values.currency,
        seats: Number(values.seats),
        ...(gst.asked
            ? {
                  gstRate: values.gstRate || null,
                  sacCode: tidySac(values.sacCode) || null,
                  gstPriceMode: itemModeInput(values.gstPriceMode),
              }
            : {}),
    };
}
