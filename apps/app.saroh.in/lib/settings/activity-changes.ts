/**
 * What a settings save recorded, and how a sentence says it: every field's
 * phrase, label and Business tab, the values a save kept (#509), and the
 * words for one field changed or several, and the counts a stock line
 * says (#515). Pure; `activity.ts` builds the Activity line from these, and
 * `activity-detail.ts` the sheet.
 */

/** The Business settings tab a field is on. */
export type BusinessTab = "identity" | "contact" | "tax" | "hours" | "address";

/**
 * Every field a settings save records: how a sentence names it, how the
 * sheet labels it, and the Business tab it is on. The four address lines
 * are one thing to a person — "the registered address" — so they share a
 * phrase and say it once; a newer save records them as one
 * `registeredAddress`.
 */
export const FIELD_PHRASES: Partial<
    Record<string, { phrase: string; label: string; tab: BusinessTab }>
> = {
    name: {
        phrase: "the business name",
        label: "Business name",
        tab: "identity",
    },
    legalName: {
        phrase: "the legal name",
        label: "Legal name",
        tab: "identity",
    },
    type: {
        phrase: "the type of business",
        label: "Type of business",
        tab: "identity",
    },
    logo: { phrase: "the logo", label: "Logo", tab: "identity" },
    timezone: { phrase: "the time zone", label: "Time zone", tab: "identity" },
    contactEmail: {
        phrase: "the contact email",
        label: "Contact email",
        tab: "contact",
    },
    website: { phrase: "the website", label: "Website", tab: "contact" },
    phone: { phrase: "the phone number", label: "Phone", tab: "contact" },
    gstRegistered: {
        phrase: "the GST registration",
        label: "GST registration",
        tab: "tax",
    },
    taxId: { phrase: "the GSTIN", label: "GSTIN or tax ID", tab: "tax" },
    invoicePrefix: {
        phrase: "the invoice prefix",
        label: "Invoice prefix",
        tab: "tax",
    },
    invoiceNumberFormat: {
        phrase: "the invoice number format",
        label: "Invoice number format",
        tab: "tax",
    },
    deliveryGstRate: {
        phrase: "GST on delivery",
        label: "GST on delivery",
        tab: "tax",
    },
    deliverySacCode: {
        phrase: "the delivery SAC",
        label: "Delivery SAC",
        tab: "tax",
    },
    openingHours: {
        phrase: "the opening hours",
        label: "Opening hours",
        tab: "hours",
    },
    registeredAddress: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    addressLine1: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    addressLine2: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    city: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    postalCode: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    gstState: { phrase: "the state", label: "State", tab: "address" },
    country: { phrase: "the country", label: "Country", tab: "address" },
};

/** "a, b and c" */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

export const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** A whole count the stream recorded, or `null` (#515's stock lines). */
export const countOf = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : null;

/** "1 storefront", "2 storefronts", with Indian digit grouping. */
export const counted = (n: number, one: string, many = `${one}s`): string =>
    `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** A value as recorded: plain, or nothing. */
export type ChangeValue = string | number | boolean | null;

/** One field a save changed, as the stream recorded it. */
export interface RecordedChange {
    field: string;
    before: ChangeValue;
    after: ChangeValue;
}

const plainValue = (v: unknown): ChangeValue =>
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v
        : null;

/**
 * The values a save recorded, or `null` for a save from before values were
 * kept (#509) — which is not the same as a save that changed none.
 */
export function recordedChanges(
    meta: Record<string, unknown>,
): RecordedChange[] | null {
    if (!Array.isArray(meta.changes)) return null;
    return meta.changes.flatMap((c): RecordedChange[] => {
        const r = record(c);
        return typeof r.field === "string"
            ? [
                  {
                      field: r.field,
                      before: plainValue(r.before),
                      after: plainValue(r.after),
                  },
              ]
            : [];
    });
}

export const fieldsOf = (meta: Record<string, unknown>): string[] =>
    Array.isArray(meta.fields)
        ? meta.fields.filter((f): f is string => typeof f === "string")
        : [];

/** Values too long to read inside a sentence; the sheet shows them. */
const LONG_FIELDS = new Set([
    "registeredAddress",
    "openingHours",
    "invoiceNumberFormat",
]);
const MAX_SENTENCE_VALUE = 32;

/**
 * One field's change said with its value: "changed the invoice prefix to
 * RC", "cleared the delivery SAC", "registered for GST", "added the logo".
 * Null when the value is too long for a sentence, or not a string.
 */
function valueSentence(change: RecordedChange): string | null {
    const known = FIELD_PHRASES[change.field];
    if (!known) return null;
    if (change.field === "logo") {
        return typeof change.after === "string"
            ? `${change.after} the logo`
            : null;
    }
    if (change.field === "gstRegistered") {
        if (change.after === true) return "registered the business for GST";
        if (change.after === false) return "took the business off GST";
        return null;
    }
    if (change.after === null) return `cleared ${known.phrase}`;
    if (LONG_FIELDS.has(change.field)) return null;
    const after = String(change.after);
    if (after.length > MAX_SENTENCE_VALUE) return null;
    return `changed ${known.phrase} to ${after}`;
}

/**
 * "updated the GSTIN and the invoice prefix". Up to three things are named;
 * past that, the first two and how many more. A field this map does not know
 * is counted, not guessed at. One field with a short recorded value is said
 * with it.
 */
export function profileChange(
    fields: readonly string[],
    changes: readonly RecordedChange[] | null,
): { what: string; tab?: BusinessTab } {
    const only = changes?.length === 1 ? changes[0] : undefined;
    const sameField =
        only &&
        (fields.length === 0 ||
            fields.every(
                (f) =>
                    FIELD_PHRASES[f]?.phrase ===
                    FIELD_PHRASES[only.field]?.phrase,
            ));
    if (only && sameField) {
        const said = valueSentence(only);
        if (said) return { what: said, tab: FIELD_PHRASES[only.field]?.tab };
    }
    if (fields.length === 1 && fields[0] === "logo") {
        return { what: "changed the logo", tab: "identity" };
    }
    const phrases: string[] = [];
    const tabs: BusinessTab[] = [];
    let unknown = 0;
    for (const field of fields) {
        const known = FIELD_PHRASES[field];
        if (!known) {
            unknown += 1;
            continue;
        }
        if (!phrases.includes(known.phrase)) phrases.push(known.phrase);
        tabs.push(known.tab);
    }
    const tab = tabs[0];
    if (phrases.length === 0) {
        return { what: "updated the business details" };
    }
    if (phrases.length <= 3 && unknown === 0) {
        return { what: `updated ${list(phrases)}`, tab };
    }
    const named = phrases.slice(0, 2);
    const extra = phrases.length - named.length + unknown;
    const others = `${extra} other ${extra === 1 ? "detail" : "details"}`;
    return { what: `updated ${named.join(", ")} and ${others}`, tab };
}

/** A module's name as recorded, else its key in words ("PAYMENTS" → "Payments"). */
export function moduleName(
    meta: Record<string, unknown>,
    key: string | null,
): string {
    const named = text(meta.module);
    if (named) return named;
    if (!key) return "a module";
    return key.charAt(0) + key.slice(1).toLowerCase();
}
