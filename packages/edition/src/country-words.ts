/**
 * Words that follow a Global business's country rather than its edition:
 * the example in its tax name and rate fields, and the names of its legal
 * forms. A business names its own tax line (DEC-204); these are only what an
 * empty field shows.
 */

export interface TaxExample {
    /** "Sales tax", "VAT", "GST". */
    name: string;
    /** The standard rate in percent, or null where it varies within the country. */
    rate: number | null;
}

// Standard rates as each tax authority publishes them (the EU's from the
// European Commission's "VAT rates applied in the Member States", 2025).
// US sales tax is set by each state and city; Canada's GST/HST by province.
const TAX_EXAMPLES: Record<string, TaxExample> = {
    US: { name: "Sales tax", rate: null },
    CA: { name: "GST/HST", rate: null },
    AU: { name: "GST", rate: 10 },
    NZ: { name: "GST", rate: 15 },
    SG: { name: "GST", rate: 9 },
    GB: { name: "VAT", rate: 20 },
    AE: { name: "VAT", rate: 5 },
    ZA: { name: "VAT", rate: 15 },
    AT: { name: "VAT", rate: 20 },
    BE: { name: "VAT", rate: 21 },
    CY: { name: "VAT", rate: 19 },
    DE: { name: "VAT", rate: 19 },
    EE: { name: "VAT", rate: 24 },
    ES: { name: "VAT", rate: 21 },
    FI: { name: "VAT", rate: 25.5 },
    FR: { name: "VAT", rate: 20 },
    GR: { name: "VAT", rate: 24 },
    HR: { name: "VAT", rate: 25 },
    IE: { name: "VAT", rate: 23 },
    IT: { name: "VAT", rate: 22 },
    LT: { name: "VAT", rate: 21 },
    LU: { name: "VAT", rate: 17 },
    LV: { name: "VAT", rate: 21 },
    MT: { name: "VAT", rate: 18 },
    NL: { name: "VAT", rate: 21 },
    PT: { name: "VAT", rate: 23 },
    SI: { name: "VAT", rate: 22 },
    SK: { name: "VAT", rate: 23 },
};

/** The tax-name and rate example for a country; "Tax" and no rate elsewhere. */
export const taxExampleFor = (country: string | null | undefined): TaxExample =>
    TAX_EXAMPLES[country?.trim().toUpperCase() ?? ""] ?? {
        name: "Tax",
        rate: null,
    };

/**
 * The six stored business types, named for a business on a named tax line
 * (`taxSystem: "named-line"`), where India's names (LLP aside) don't apply.
 * The codes and what the API accepts don't change.
 */
export const NAMED_LINE_BUSINESS_TYPES = {
    individual: "Sole proprietor",
    partnership: "Partnership",
    llp: "LLP",
    pvt: "Private company (LLC, Ltd)",
    public: "Public company",
    trust: "Non-profit or trust",
} as const satisfies Record<string, string>;
