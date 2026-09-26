/**
 * India's GST state codes (the first two digits of a GSTIN) and the one rule
 * for reading a state someone typed — a code ("29") or a name ("Karnataka",
 * "karnataka ") — as a code. Place of supply compares codes, never names.
 */
export const GST_STATES: readonly { code: string; name: string }[] = [
    { code: "01", name: "Jammu and Kashmir" },
    { code: "02", name: "Himachal Pradesh" },
    { code: "03", name: "Punjab" },
    { code: "04", name: "Chandigarh" },
    { code: "05", name: "Uttarakhand" },
    { code: "06", name: "Haryana" },
    { code: "07", name: "Delhi" },
    { code: "08", name: "Rajasthan" },
    { code: "09", name: "Uttar Pradesh" },
    { code: "10", name: "Bihar" },
    { code: "11", name: "Sikkim" },
    { code: "12", name: "Arunachal Pradesh" },
    { code: "13", name: "Nagaland" },
    { code: "14", name: "Manipur" },
    { code: "15", name: "Mizoram" },
    { code: "16", name: "Tripura" },
    { code: "17", name: "Meghalaya" },
    { code: "18", name: "Assam" },
    { code: "19", name: "West Bengal" },
    { code: "20", name: "Jharkhand" },
    { code: "21", name: "Odisha" },
    { code: "22", name: "Chhattisgarh" },
    { code: "23", name: "Madhya Pradesh" },
    { code: "24", name: "Gujarat" },
    { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
    { code: "27", name: "Maharashtra" },
    { code: "29", name: "Karnataka" },
    { code: "30", name: "Goa" },
    { code: "31", name: "Lakshadweep" },
    { code: "32", name: "Kerala" },
    { code: "33", name: "Tamil Nadu" },
    { code: "34", name: "Puducherry" },
    { code: "35", name: "Andaman and Nicobar Islands" },
    { code: "36", name: "Telangana" },
    { code: "37", name: "Andhra Pradesh" },
    { code: "38", name: "Ladakh" },
    { code: "97", name: "Other Territory" },
];

const BY_CODE = new Map(GST_STATES.map((s) => [s.code, s]));
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const BY_NAME = new Map(GST_STATES.map((s) => [squash(s.name), s.code]));
// Names people type that are not the register's.
BY_NAME.set("orissa", "21");
BY_NAME.set("pondicherry", "34");
BY_NAME.set("newdelhi", "07");
BY_NAME.set("nctofdelhi", "07");
BY_NAME.set("jammukashmir", "01");
BY_NAME.set("andamannicobar", "35");

/** A code or a name → the state's code; anything unknown → null. */
export function stateCode(value: string | null | undefined): string | null {
    if (!value) return null;
    const t = value.trim();
    if (/^\d{1,2}$/.test(t)) {
        const code = t.padStart(2, "0");
        return BY_CODE.has(code) ? code : null;
    }
    return BY_NAME.get(squash(t)) ?? null;
}

export function stateName(code: string | null | undefined): string | null {
    return code ? (BY_CODE.get(code)?.name ?? null) : null;
}

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN's own check character, from its first fourteen. */
export function gstinCheckChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return ALPHABET[(36 - (sum % 36)) % 36];
}

/**
 * Why a GSTIN is refused, or null when it stands: fifteen characters in the
 * register's shape, a known state, the right check character — and, when
 * the business names its state, the same state.
 */
export function gstinProblem(
    gstin: string,
    state?: string | null,
): string | null {
    const g = gstin.trim().toUpperCase();
    if (!GSTIN_SHAPE.test(g)) {
        return "A GSTIN is 15 characters, like 29ABCDE1234F1ZW.";
    }
    if (!BY_CODE.has(g.slice(0, 2))) {
        return "That GSTIN starts with a state code that does not exist.";
    }
    if (gstinCheckChar(g.slice(0, 14)) !== g[14]) {
        return "That GSTIN does not check out. Look for a mistyped character.";
    }
    if (state && g.slice(0, 2) !== state) {
        return `That GSTIN is registered in ${stateName(g.slice(0, 2))}, not ${stateName(state) ?? "the state chosen"}.`;
    }
    return null;
}
