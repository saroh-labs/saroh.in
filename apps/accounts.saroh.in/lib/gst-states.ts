/**
 * India's GST state codes and names (the register's), for a billing
 * profile's State and the GSTIN check. The same list as app.saroh.in's
 * `lib/invoices/gst.ts`; the API holds the rule (`invoices/gst-states.ts`).
 */
export const GST_STATES = [
    { value: "01", label: "Jammu and Kashmir" },
    { value: "02", label: "Himachal Pradesh" },
    { value: "03", label: "Punjab" },
    { value: "04", label: "Chandigarh" },
    { value: "05", label: "Uttarakhand" },
    { value: "06", label: "Haryana" },
    { value: "07", label: "Delhi" },
    { value: "08", label: "Rajasthan" },
    { value: "09", label: "Uttar Pradesh" },
    { value: "10", label: "Bihar" },
    { value: "11", label: "Sikkim" },
    { value: "12", label: "Arunachal Pradesh" },
    { value: "13", label: "Nagaland" },
    { value: "14", label: "Manipur" },
    { value: "15", label: "Mizoram" },
    { value: "16", label: "Tripura" },
    { value: "17", label: "Meghalaya" },
    { value: "18", label: "Assam" },
    { value: "19", label: "West Bengal" },
    { value: "20", label: "Jharkhand" },
    { value: "21", label: "Odisha" },
    { value: "22", label: "Chhattisgarh" },
    { value: "23", label: "Madhya Pradesh" },
    { value: "24", label: "Gujarat" },
    { value: "26", label: "Dadra and Nagar Haveli and Daman and Diu" },
    { value: "27", label: "Maharashtra" },
    { value: "29", label: "Karnataka" },
    { value: "30", label: "Goa" },
    { value: "31", label: "Lakshadweep" },
    { value: "32", label: "Kerala" },
    { value: "33", label: "Tamil Nadu" },
    { value: "34", label: "Puducherry" },
    { value: "35", label: "Andaman and Nicobar Islands" },
    { value: "36", label: "Telangana" },
    { value: "37", label: "Andhra Pradesh" },
    { value: "38", label: "Ladakh" },
    { value: "97", label: "Other Territory" },
] as const;

const BY_CODE = new Map<string, string>(
    GST_STATES.map((s) => [s.value, s.label]),
);

/** A state's name from its two-digit code; null when there is none. */
export function stateName(code: string | null | undefined): string | null {
    return code ? (BY_CODE.get(code) ?? null) : null;
}

/** Fifteen characters in the register's shape. The API checks the rest. */
export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
