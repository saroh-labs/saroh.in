import { z } from "zod";

import { id } from "../common";

/**
 * Pieces the `/v1` secret routes share (plan 2026-11-10-001, U8).
 */

/** A price someone sets: whole minor units, never negative. */
export const price = z.strictObject({
    amountMinor: z.number().int().min(0).max(9_999_999_999),
    currency: z
        .string()
        .regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code, like INR"),
});
export type Price = z.infer<typeof price>;

/** An instant, as ISO 8601 with an offset (`2026-11-12T10:00:00Z`). */
export const instant = z.iso.datetime({ offset: true });

/** A timestamp in an answer. */
export const timestamp = z.string().describe("ISO 8601");

/** Path params every `/:xId` route takes. */
export const idParam = <K extends string>(name: K) =>
    z.strictObject({ [name]: id } as Record<K, typeof id>);

/** Trimmed text with bounds; `max` is required so no field is unbounded. */
export const text = (max: number, min = 1) =>
    z.string().trim().min(min).max(max);
