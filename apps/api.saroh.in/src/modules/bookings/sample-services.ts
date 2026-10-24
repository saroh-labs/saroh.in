/**
 * Sample services (DEC-189): what a trade starter writes. A sample is
 * written hidden from the booking page, and every public read also filters
 * on {@link NOT_SAMPLE}, so none is shown or booked before the owner keeps
 * or edits it. Either one is {@link KEPT}: no longer a sample, and shown.
 */

/** The public readers' filter: never a sample. */
export const NOT_SAMPLE = { isSample: false } as const;

/** What keeping (or first editing) a sample writes. */
export const KEPT = { isSample: false, showOnBookingPage: true } as const;
