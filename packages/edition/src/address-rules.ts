/**
 * The last lines of an address where a business's profile writes them as a
 * country and region (`address: "country-and-region"`): the postcode's shape
 * and name, and the region's, by the address's country (ISO 3166-1 alpha-2).
 * The API holds a save to these; the workspace and the merchant site say the
 * same as people type, so all three read this one table. India isn't here:
 * its state list and six-digit PIN live with the API and the app, unchanged.
 *
 * No imports and no env: `@saroh/block-contract` re-exports this file through
 * its own subpath (`@saroh/edition/address-rules`), so site blocks can read it.
 *
 * A country not in the table takes any postcode and region, both optional,
 * so nothing that saves today starts failing.
 */

export type Checked = { value: string } | { problem: string };

export interface RegionOption {
    /** Stored and printed: "TX", "ON", "NSW". */
    code: string;
    name: string;
}

export interface PostcodeRule {
    /** "ZIP code", "Postal code", "Postcode". */
    label: string;
    /** Shown in an empty field, and in the problem. */
    example: string;
    /** Whether a business's own address needs one. */
    required: boolean;
}

export type RegionRule =
    /** Chosen from the list and required; stored as its code. */
    | { kind: "list"; label: string; options: readonly RegionOption[] }
    /** Typed, optional; stored as typed. */
    | { kind: "text"; label: string }
    /** Not asked. */
    | { kind: "none" };

export interface AddressRules {
    /** Null where the country has no postcodes: the field isn't shown. */
    postcode: PostcodeRule | null;
    region: RegionRule;
}

interface PostcodeShape extends PostcodeRule {
    /** Matched against the typed code in capitals, spaces and hyphens gone. */
    pattern: RegExp;
    /** The code as the country writes it, from the pattern's groups. */
    write: (m: RegExpMatchArray) => string;
    /** "5 digits", for "A ZIP code is 5 digits, like 94105." */
    shape: string;
}

interface CountryRow {
    postcode: PostcodeShape | null;
    region: RegionRule;
}

const asTyped = (m: RegExpMatchArray) => m.slice(1).join("");
const spaced = (m: RegExpMatchArray) => m.slice(1).join(" ");

const postcode = (
    label: string,
    example: string,
    shape: string,
    pattern: RegExp,
    write: (m: RegExpMatchArray) => string = asTyped,
): PostcodeShape => ({ label, example, required: true, pattern, write, shape });

/** Euro countries' codes that are digits only, written as typed. */
const digitsOnly = (n: number, example: string) =>
    postcode("Postcode", example, `${n} digits`, new RegExp(`^(\\d{${n}})$`));

const REGION_TEXT: RegionRule = { kind: "text", label: "Region" };

const list = (label: string, entries: string): RegionRule => ({
    kind: "list",
    label,
    options: entries.split(";").map((e) => {
        const [code, name] = e.split("=");
        return { code, name };
    }),
});

const ROWS: Record<string, CountryRow> = {
    // USPS Publication 28, 2: a ZIP Code is five digits, ZIP+4 adds a hyphen
    // and four. States, DC and the inhabited territories by their USPS
    // two-letter codes (Publication 28, Appendix B).
    US: {
        postcode: postcode(
            "ZIP code",
            "94105",
            "5 digits, or 5 and 4 with a hyphen",
            /^(\d{5})(\d{4})?$/,
            (m) => (m[2] ? `${m[1]}-${m[2]}` : m[1]),
        ),
        region: list(
            "State",
            "AL=Alabama;AK=Alaska;AZ=Arizona;AR=Arkansas;CA=California;CO=Colorado;CT=Connecticut;DE=Delaware;FL=Florida;GA=Georgia;HI=Hawaii;ID=Idaho;IL=Illinois;IN=Indiana;IA=Iowa;KS=Kansas;KY=Kentucky;LA=Louisiana;ME=Maine;MD=Maryland;MA=Massachusetts;MI=Michigan;MN=Minnesota;MS=Mississippi;MO=Missouri;MT=Montana;NE=Nebraska;NV=Nevada;NH=New Hampshire;NJ=New Jersey;NM=New Mexico;NY=New York;NC=North Carolina;ND=North Dakota;OH=Ohio;OK=Oklahoma;OR=Oregon;PA=Pennsylvania;RI=Rhode Island;SC=South Carolina;SD=South Dakota;TN=Tennessee;TX=Texas;UT=Utah;VT=Vermont;VA=Virginia;WA=Washington;WV=West Virginia;WI=Wisconsin;WY=Wyoming;DC=District of Columbia;AS=American Samoa;GU=Guam;MP=Northern Mariana Islands;PR=Puerto Rico;VI=U.S. Virgin Islands",
        ),
    },
    // Canada Post, Addressing Guidelines: letter digit letter, space, digit
    // letter digit; D, F, I, O, Q and U never appear, W and Z never first.
    // Provinces and territories by Canada Post's two-letter symbols.
    CA: {
        postcode: postcode(
            "Postal code",
            "K1A 0B1",
            "letter, digit, letter, digit, letter, digit",
            /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])(\d[ABCEGHJ-NPRSTV-Z]\d)$/,
            spaced,
        ),
        region: list(
            "Province or territory",
            "AB=Alberta;BC=British Columbia;MB=Manitoba;NB=New Brunswick;NL=Newfoundland and Labrador;NS=Nova Scotia;NT=Northwest Territories;NU=Nunavut;ON=Ontario;PE=Prince Edward Island;QC=Quebec;SK=Saskatchewan;YT=Yukon",
        ),
    },
    // Royal Mail, Programmers' Guide to PAF: an outward code (area, district)
    // and an inward code (sector digit, two unit letters, never C I K M O V).
    GB: {
        postcode: postcode(
            "Postcode",
            "SW1A 1AA",
            "letters and digits",
            /^([A-Z]{1,2}\d[A-Z\d]?)(\d[ABD-HJLNP-UW-Z]{2})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    // Australia Post, Addressing Guidelines: a four-digit postcode. States and
    // territories by Australia Post's abbreviations.
    AU: {
        postcode: postcode("Postcode", "2000", "4 digits", /^(\d{4})$/),
        region: list(
            "State or territory",
            "ACT=Australian Capital Territory;NSW=New South Wales;NT=Northern Territory;QLD=Queensland;SA=South Australia;TAS=Tasmania;VIC=Victoria;WA=Western Australia",
        ),
    },
    // NZ Post, Postcode Guide: four digits.
    NZ: {
        postcode: postcode("Postcode", "6011", "4 digits", /^(\d{4})$/),
        region: REGION_TEXT,
    },
    // SingPost: a six-digit postal code; the city-state has no regions in an
    // address.
    SG: {
        postcode: postcode("Postal code", "018956", "6 digits", /^(\d{6})$/),
        region: { kind: "none" },
    },
    // The UAE has no postcodes (UPU, Postal addressing systems: AE).
    AE: { postcode: null, region: REGION_TEXT },
    // South African Post Office: a four-digit postal code.
    ZA: {
        postcode: postcode("Postal code", "8001", "4 digits", /^(\d{4})$/),
        region: REGION_TEXT,
    },

    // The euro countries. Each per its post, as the UPU's Postal addressing
    // systems page for the country sets it out.
    AT: { postcode: digitsOnly(4, "1010"), region: REGION_TEXT }, // Österreichische Post
    BE: { postcode: digitsOnly(4, "1000"), region: REGION_TEXT }, // bpost
    CY: { postcode: digitsOnly(4, "1010"), region: REGION_TEXT }, // Cyprus Post
    DE: { postcode: digitsOnly(5, "10115"), region: REGION_TEXT }, // Deutsche Post
    EE: { postcode: digitsOnly(5, "10111"), region: REGION_TEXT }, // Omniva
    ES: { postcode: digitsOnly(5, "28013"), region: REGION_TEXT }, // Correos
    FI: { postcode: digitsOnly(5, "00100"), region: REGION_TEXT }, // Posti
    FR: { postcode: digitsOnly(5, "75001"), region: REGION_TEXT }, // La Poste
    HR: { postcode: digitsOnly(5, "10000"), region: REGION_TEXT }, // Hrvatska pošta
    IT: { postcode: digitsOnly(5, "00184"), region: REGION_TEXT }, // Poste Italiane (CAP)
    // ELTA and Slovenská pošta write five digits as three, a space, two.
    GR: {
        postcode: postcode(
            "Postcode",
            "105 57",
            "5 digits",
            /^(\d{3})(\d{2})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    SK: {
        postcode: postcode(
            "Postcode",
            "811 01",
            "5 digits",
            /^(\d{3})(\d{2})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    // An Post, Eircode: a routing key (a letter of A C D E F H K N P R T V W
    // X Y and two digits, or D6W) and a four-character unique identifier.
    IE: {
        postcode: postcode(
            "Eircode",
            "D02 X285",
            "a letter and 2 digits, then 4 letters and digits",
            /^([AC-FHKNPRTV-Y]\d{2}|D6W)([0-9AC-FHKNPRTV-Y]{4})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    // Latvijas Pasts: "LV-" and four digits.
    LV: {
        postcode: postcode(
            "Postcode",
            "LV-1050",
            "LV- and 4 digits",
            /^(?:LV)?(\d{4})$/,
            (m) => `LV-${m[1]}`,
        ),
        region: REGION_TEXT,
    },
    // Lietuvos paštas: "LT-" and five digits.
    LT: {
        postcode: postcode(
            "Postcode",
            "LT-01100",
            "LT- and 5 digits",
            /^(?:LT)?(\d{5})$/,
            (m) => `LT-${m[1]}`,
        ),
        region: REGION_TEXT,
    },
    // POST Luxembourg: four digits, often written after "L-"; stored without.
    LU: {
        postcode: postcode("Postcode", "1009", "4 digits", /^(?:L)?(\d{4})$/),
        region: REGION_TEXT,
    },
    // MaltaPost (2007 postcodes): three letters, a space, four digits.
    MT: {
        postcode: postcode(
            "Postcode",
            "VLT 1117",
            "3 letters and 4 digits",
            /^([A-Z]{3})(\d{4})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    // PostNL: four digits (never starting 0), a space, two letters.
    NL: {
        postcode: postcode(
            "Postcode",
            "1012 AB",
            "4 digits and 2 letters",
            /^([1-9]\d{3})([A-Z]{2})$/,
            spaced,
        ),
        region: REGION_TEXT,
    },
    // CTT Correios: four digits, a hyphen, three.
    PT: {
        postcode: postcode(
            "Postcode",
            "1100-148",
            "4 digits, a hyphen and 3",
            /^(\d{4})(\d{3})$/,
            (m) => `${m[1]}-${m[2]}`,
        ),
        region: REGION_TEXT,
    },
    // Pošta Slovenije: four digits, sometimes after "SI-"; stored without.
    SI: {
        postcode: postcode("Postcode", "1000", "4 digits", /^(?:SI)?(\d{4})$/),
        region: REGION_TEXT,
    },
};

/** The countries with their own rules. India is never one. */
export const ADDRESS_RULES_COUNTRIES: readonly string[] = Object.keys(ROWS);

const codeOf = (country: string | null | undefined) =>
    country?.trim().toUpperCase() ?? "";

const known = (country: string | null | undefined) =>
    ROWS[codeOf(country)] as CountryRow | undefined;

/** "Postcode" reads "postcode" mid-sentence; "ZIP code" and "Eircode" stay. */
const inSentence = (label: string) =>
    /^(Post|State|Province|Region)/.test(label) ? label.toLowerCase() : label;

const article = (word: string) => (/^[AEIOU]/i.test(word) ? "An" : "A");

/** What an address in this country asks, and in which words. */
export function addressRulesFor(
    country: string | null | undefined,
): AddressRules {
    const row = known(country);
    if (!row) {
        return {
            postcode: { label: "Postcode", example: "", required: false },
            region: REGION_TEXT,
        };
    }
    const p = row.postcode;
    return {
        postcode: p
            ? { label: p.label, example: p.example, required: p.required }
            : null,
        region: row.region,
    };
}

/**
 * The postcode as stored, or why it isn't one. Blank is refused only when
 * `required`, which defaults to the country's rule for a business's own
 * address; a customer's address passes its own. A country with no postcodes
 * drops anything typed (its field isn't shown). A country not in the table
 * takes anything, trimmed.
 */
export function checkPostcode(
    country: string | null | undefined,
    typed: string | null | undefined,
    required?: boolean,
): Checked {
    const text = (typed ?? "").trim().replace(/\s+/g, " ");
    const row = known(country);
    if (!row) return { value: text };
    const rule = row.postcode;
    if (!rule) return { value: "" };
    if (!text) {
        return (required ?? rule.required)
            ? { problem: `Add the ${inSentence(rule.label)}.` }
            : { value: "" };
    }
    const m = text.toUpperCase().replace(/[\s-]/g, "").match(rule.pattern);
    if (m) return { value: rule.write(m) };
    const word = inSentence(rule.label);
    return {
        problem: `${article(word)} ${word} is ${rule.shape}, like ${rule.example}.`,
    };
}

/**
 * The region as stored, or why it isn't one. From a list, a code or a name
 * in any case reads as its code ("Texas" is "TX"), and blank is refused
 * unless `required` is false. Typed, it's trimmed and optional. Not asked,
 * it's dropped.
 */
export function checkRegion(
    country: string | null | undefined,
    typed: string | null | undefined,
    required?: boolean,
): Checked {
    const text = (typed ?? "").trim().replace(/\s+/g, " ");
    const rule = known(country)?.region ?? REGION_TEXT;
    if (rule.kind === "none") return { value: "" };
    if (rule.kind === "text") return { value: text };
    const word = inSentence(rule.label);
    if (!text) {
        return (required ?? true)
            ? { problem: `Choose your ${word}.` }
            : { value: "" };
    }
    const upper = text.toUpperCase();
    const found = rule.options.find(
        (o) => o.code === upper || o.name.toUpperCase() === upper,
    );
    return found
        ? { value: found.code }
        : { problem: `Choose a ${word} from the list.` };
}
