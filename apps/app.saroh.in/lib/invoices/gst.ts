/**
 * GST as the editors offer it (ADR-008): the rates GST has, India's GST
 * state codes, and the shape of a GSTIN, HSN and SAC. Client-safe and pure;
 * the API (`invoices/gst.ts`, `invoices/gst-states.ts`) is the authority and
 * checks every value again, the GSTIN's check character included.
 */

/** A "Not set" row, then GST's rates, as percent strings the API takes. */
export const GST_RATE_OPTIONS = [
    { value: "", label: "Not set" },
    { value: "0", label: "0% — nil-rated or exempt" },
    { value: "0.25", label: "0.25%" },
    { value: "3", label: "3%" },
    { value: "5", label: "5%" },
    { value: "12", label: "12%" },
    { value: "18", label: "18%" },
    { value: "28", label: "28%" },
    { value: "40", label: "40%" },
] as const;

export type GstRateValue = (typeof GST_RATE_OPTIONS)[number]["value"];

/** A saved rate ("18.00", "0.25") as its option's value, or "" when unset or unknown. */
export function rateOption(rate: string | null | undefined): GstRateValue {
    if (rate === null || rate === undefined || rate.trim() === "") return "";
    const n = Number(rate);
    const found = GST_RATE_OPTIONS.find(
        (o) => o.value !== "" && Number(o.value) === n,
    );
    return found ? found.value : "";
}

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

/** Fifteen characters in the register's shape. The API checks the rest. */
export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** HSN (goods) or SAC (services): four to eight digits, spaces ignored. */
export const HSN_SAC_SHAPE = /^\d{4,8}$/;

export function isHsnSac(value: string): boolean {
    return HSN_SAC_SHAPE.test(value.replace(/\s+/g, ""));
}

/** An invoice prefix: one to three capitals or digits (RC → RC/26-27/0001). */
export const PREFIX_SHAPE = /^[A-Z0-9]{1,3}$/;
