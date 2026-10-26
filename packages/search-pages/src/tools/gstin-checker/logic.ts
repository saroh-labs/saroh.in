/**
 * The GSTIN checker's rules (design GstinChecker*.dc.html, its generator
 * genA/gstin.py): the shape, the state code and the check character, all
 * in the browser. It can't look up the business, so it never says a
 * GSTIN is real, only that it is typed right.
 */

/**
 * India's GST state codes, copied from apps/accounts.saroh.in/lib/
 * gst-states.ts (this package imports nothing from the workspace; a test
 * holds the two lists the same).
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

const STATES = new Map<string, string>(
    GST_STATES.map((s) => [s.value, s.label]),
);

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN's own check character, from its first fourteen (as the API's gstinCheckChar). */
export function gstinCheckChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const product =
            ALPHABET.indexOf(first14[i] ?? "0") * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return ALPHABET[(36 - (sum % 36)) % 36] ?? "0";
}

/** The PAN's 4th letter: what kind of holder it is. */
const PAN_TYPES: Record<string, string> = {
    P: "a person",
    C: "a company",
    H: "a Hindu undivided family",
    F: "a firm",
    A: "association of persons",
    T: "a trust",
    B: "body of individuals",
    L: "local authority",
    J: "artificial juridical person",
    G: "government",
};

function ordinal(n: number): string {
    const tail =
        n % 100 >= 11 && n % 100 <= 13
            ? "th"
            : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10];
    return `${n}${tail ?? "th"}`;
}

export interface CheckRow {
    label: string;
    value: string;
    /** true ticked, false crossed, null only said. */
    ok: boolean | null;
    mono?: boolean;
    toConfirm?: boolean;
}

export interface GstinCheck {
    gstin: string;
    ok: boolean;
    verdict: string;
    rows: CheckRow[];
    /** Under the field once they leave it. */
    error: string | null;
    /** Under the rows. */
    note: string | null;
    /** The list's one line for it. */
    line: string;
}

/** Spaces and lower case are fixed; anything else is checked as typed. */
export const tidy = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

function stateRow(code: string): CheckRow {
    const name = STATES.get(code);
    return name
        ? { label: "State code", value: `${code} · ${name}`, ok: true }
        : { label: "State code", value: `${code} isn't one`, ok: false };
}

/** What's right and wrong with a typed GSTIN; null when nothing is typed. */
export function checkGstin(raw: string): GstinCheck | null {
    const g = tidy(raw);
    if (!g) return null;
    const bad = (
        verdict: string,
        rows: CheckRow[],
        line: string,
        error: string | null = null,
        note: string | null = null,
    ): GstinCheck => ({
        gstin: g,
        ok: false,
        verdict,
        rows,
        error,
        note,
        line,
    });

    if (!/^[0-9A-Z]+$/.test(g))
        return bad(
            "Not a GSTIN",
            [],
            "Has characters a GSTIN doesn't",
            "A GSTIN has only letters and digits.",
        );
    const code = g.slice(0, 2);
    if (g.length !== 15) {
        return bad(
            g.length < 15 ? "Not a full GSTIN yet" : "Longer than a GSTIN",
            [
                { label: "Length", value: `${g.length} of 15`, ok: false },
                ...(/^\d\d$/.test(code) ? [stateRow(code)] : []),
            ],
            `${g.length} characters, not 15`,
            `A GSTIN has 15 characters. This one has ${g.length}.`,
        );
    }
    const state = STATES.get(code);
    if (!state)
        return bad(
            "Not a GST state code",
            [stateRow(code)],
            `${code} isn't a state code`,
            null,
            "State codes are two digits from the GST list, like 07 Delhi, 27 Maharashtra or 29 Karnataka.",
        );
    const pan = g.slice(2, 12);
    const panOk = /^[A-Z]{5}\d{4}[A-Z]$/.test(pan);
    const reg = g[12] ?? "";
    const regOk = /^[1-9A-Z]$/.test(reg);
    const zOk = g[13] === "Z";
    const check = gstinCheckChar(g.slice(0, 14));
    const panRow: CheckRow = {
        label: "PAN",
        value: panOk ? pan : `${pan} isn't a PAN`,
        ok: panOk,
        mono: true,
    };
    if (!panOk || !regOk || !zOk) {
        return bad(
            "The format isn't right",
            [
                stateRow(code),
                panRow,
                {
                    label: "Registration in the state",
                    value: regOk ? reg : `${reg} can't be one`,
                    ok: regOk ? null : false,
                },
                {
                    label: "14th character",
                    value: zOk ? "Z" : `${g[13]}, should be Z`,
                    ok: zOk,
                },
            ],
            !panOk
                ? "The PAN part isn't right"
                : !regOk
                  ? "13th character can't be 0"
                  : "14th character should be Z",
        );
    }
    if (g[14] !== check)
        return bad(
            "One character looks mistyped",
            [
                stateRow(code),
                panRow,
                {
                    label: "Check digit",
                    value: `${g[14]}, should be ${check}`,
                    ok: false,
                },
            ],
            `Check digit should be ${check}`,
            null,
            "Check it against their bill or ask them for it again. The last character comes from the other 14.",
        );
    const type = PAN_TYPES[pan[3] ?? ""];
    const n = /\d/.test(reg) ? Number(reg) : ALPHABET.indexOf(reg);
    return {
        gstin: g,
        ok: true,
        verdict: "The format is right",
        rows: [
            { label: "Length", value: "15 characters", ok: true },
            stateRow(code),
            panRow,
            ...(type
                ? [
                      {
                          label: "PAN type",
                          value: `${pan[3]} · ${type}`,
                          ok: null,
                          toConfirm: true,
                      },
                  ]
                : []),
            { label: "Registration in the state", value: ordinal(n), ok: null },
            { label: "14th character", value: "Z", ok: true },
            { label: "Check digit", value: `${check} matches`, ok: true },
        ],
        error: null,
        note: null,
        line: `Format right · ${state}`,
    };
}

/** Several GSTINs, one a line; blank lines skipped. */
export const checkList = (text: string) =>
    text
        .split(/\n/)
        .map(checkGstin)
        .filter((c): c is GstinCheck => c !== null);

/** The list as a spreadsheet: GSTIN, right or not, what to fix. */
export function listCsv(checks: GstinCheck[]): string {
    return [
        "GSTIN,Format right,Result",
        ...checks.map((c) =>
            [
                c.gstin,
                c.ok ? "Yes" : "No",
                `"${c.line.replace(/"/g, '""')}"`,
            ].join(","),
        ),
    ].join("\n");
}

export const MODES = [
    { value: "one", label: "Check one" },
    { value: "list", label: "Check a list" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

export const WORDS = {
    form: "The GSTIN to check",
    mode: "What to check",
    gstin: "GSTIN",
    hint: "15 characters, like 29AAAAA0000A1ZY. Spaces and lower case are fixed for you.",
    list: "GSTINs, one per line",
    empty: "Paste a GSTIN to check its format.",
    emptyList: "Paste GSTINs, one per line, to check them all.",
    notReal:
        "A right format doesn't mean the business is real or still registered. To see its name and status,",
    portal: "search it on the GST portal",
    portalUrl: "https://services.gst.gov.in/services/searchtp",
    gate: "Get the result as a PDF",
    gateButton: "Email me the PDF",
    print: "Print or save as PDF",
    listGate: "Get the results as a spreadsheet (CSV)",
    listButton: "Email me the file",
    csv: "Download the results (CSV)",
} as const;
