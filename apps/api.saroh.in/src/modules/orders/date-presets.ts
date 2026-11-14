/**
 * The date presets every list's date filter takes (Orders' B4, then
 * Invoices, All bookings and the stock log), read in the business's zone:
 * today, yesterday, the last 7 days (today included) and this month. A
 * file of its own, with no decorators, so any DTO can import it.
 */
export const DATE_PRESETS = ["today", "yesterday", "7d", "month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
