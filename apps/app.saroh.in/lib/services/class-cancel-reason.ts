import { z } from "zod";

/**
 * The reason a whole class is cancelled with (DEC-178, #1172): the API's
 * rule (`CancelBookingDto`), said before it refuses. One line of the
 * business's own words, 1 to 200 characters once trimmed.
 */

export const CLASS_CANCEL_REASON_MAX = 200;

/** Trimmed, with any run of spaces or line breaks made one space. */
export function oneLineReason(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

export const classCancelReasonSchema = z.object({
    reason: z
        .string()
        .refine((v) => oneLineReason(v).length > 0, {
            message: "Say why the class is cancelled",
        })
        .refine((v) => oneLineReason(v).length <= CLASS_CANCEL_REASON_MAX, {
            message: `A reason can be at most ${CLASS_CANCEL_REASON_MAX} characters`,
        }),
});

export type ClassCancelReason = z.infer<typeof classCancelReasonSchema>;
