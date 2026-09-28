/**
 * A business's legal form, in the "Saroh Settings" design's words (F10,
 * default 60): the six the API validates (`business-type.ts` there), or
 * Not set.
 *
 * Today's `company` is a private limited company, spelled `pvt` from now on.
 * The rename runs readers first (release boundary 9): this release reads
 * both spellings as Private limited, and still SENDS `company` for it, which
 * every API in production accepts. The follow-up F10b sends `pvt` and moves
 * the stored rows; Z4 then drops `company`.
 */

export const BUSINESS_TYPE_OPTIONS = [
    { value: "", label: "Not set" },
    { value: "individual", label: "Individual / sole proprietor" },
    { value: "partnership", label: "Partnership" },
    { value: "llp", label: "LLP" },
    { value: "pvt", label: "Private limited company" },
    { value: "public", label: "Public limited company" },
    { value: "trust", label: "Trust or society" },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_OPTIONS)[number]["value"];

/** The form's values: a type, or "" for Not set. */
export const BUSINESS_TYPE_VALUES = BUSINESS_TYPE_OPTIONS.map(
    (o) => o.value,
) as [BusinessTypeValue, ...BusinessTypeValue[]];

/** The old spelling of `pvt`, which the API still stores (see above). */
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

/** What a save sends for a type: Private limited as `company`, this release. */
export function businessTypeForApi(value: BusinessTypeValue): string {
    return value === "pvt" ? LEGACY_PRIVATE_LIMITED : value;
}
