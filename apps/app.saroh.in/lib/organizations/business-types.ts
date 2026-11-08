import { NAMED_LINE_BUSINESS_TYPES } from "@saroh/edition";

import { PROFILE } from "@/lib/edition";

/**
 * A business's legal form, in the "Saroh Settings" design's words (F10,
 * default 60): the six the API validates (`business-type.ts` there), or
 * Not set.
 *
 * `company` was a private limited company, spelled `pvt` from F10 on. The
 * rename runs readers first (release boundary 9): F10 read both spellings
 * and still sent `company`; F10b (this release) sends `pvt`, which every API
 * in production since F10 accepts, and a backfill moves the stored rows. The
 * app still reads `company` as Private limited, so an API rolled back to F10
 * before the backfill ran still names it; Z4 drops `company`.
 */

/** India's names; a named tax line (Global) names the same six generically. */
const named = (value: keyof typeof NAMED_LINE_BUSINESS_TYPES, india: string) =>
    PROFILE.taxSystem === "gst" ? india : NAMED_LINE_BUSINESS_TYPES[value];

export const BUSINESS_TYPE_OPTIONS = [
    { value: "", label: "Not set" },
    {
        value: "individual",
        label: named("individual", "Individual / sole proprietor"),
    },
    { value: "partnership", label: named("partnership", "Partnership") },
    { value: "llp", label: named("llp", "LLP") },
    { value: "pvt", label: named("pvt", "Private limited company") },
    { value: "public", label: named("public", "Public limited company") },
    { value: "trust", label: named("trust", "Trust or society") },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_OPTIONS)[number]["value"];

/** The form's values: a type, or "" for Not set. */
export const BUSINESS_TYPE_VALUES = BUSINESS_TYPE_OPTIONS.map(
    (o) => o.value,
) as [BusinessTypeValue, ...BusinessTypeValue[]];

/** The old spelling of `pvt`, read until Z4 (see above). */
const LEGACY_PRIVATE_LIMITED = "company";

/**
 * A stored type as the form holds it: `company` is Private limited, and a
 * value this app does not know reads as Not set.
 */
export function businessTypeOf(
    stored: string | null | undefined,
): BusinessTypeValue {
    const value = stored === LEGACY_PRIVATE_LIMITED ? "pvt" : (stored ?? "");
    return BUSINESS_TYPE_VALUES.find((v) => v === value) ?? "";
}

/** "Private limited company"; null for Not set or a value not known. */
export function businessTypeLabel(
    stored: string | null | undefined,
): string | null {
    const value = businessTypeOf(stored);
    if (!value) return null;
    return BUSINESS_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}
