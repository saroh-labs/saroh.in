/**
 * What a settings change may say about itself in the audit stream (#509).
 *
 * `AuditEvent.metadata` is "redacted, non-sensitive context (never
 * secrets/PII)". A business's own details — its name, its GSTIN, its
 * registered address, its invoice prefix — are printed on every invoice it
 * issues, so the stream may carry them as they were and as they became,
 * which is what lets Settings › Activity say "Invoice prefix: INV → RC".
 * A person's details are not: the contact email, the phone and the website
 * are recorded by NAME only, as every field was before.
 *
 * This file is the one list of which is which. A field on neither list is
 * never given a value: {@link recordableChanges} drops it, so a field added
 * to a form later stays name-only until someone decides otherwise here.
 */

/** A value an audit row may carry: small and plain, never an object. */
export type AuditValue = string | number | boolean | null;

/** One field as it was and as it became. */
export interface FieldChange {
    field: string;
    before: AuditValue;
    after: AuditValue;
}

/**
 * Business details recorded with their values. Each is printed on an
 * invoice or a receipt, or says how the business keeps time or numbers.
 */
export const VALUE_FIELDS = [
    "name",
    "legalName",
    "type",
    "country",
    "timezone",
    "gstRegistered",
    "taxId",
    "gstState",
    "invoicePrefix",
    "invoiceNumberFormat",
    "deliveryGstRate",
    "deliverySacCode",
    "registeredAddress",
    "logo",
    "openingHours",
] as const;

/**
 * Personal details: recorded as "changed", never with a value. A contact
 * email or a phone is a person's; a website can be one too.
 */
export const NAME_ONLY_FIELDS = ["contactEmail", "phone", "website"] as const;

const WITH_VALUES: ReadonlySet<string> = new Set(VALUE_FIELDS);
const NEVER_VALUES: ReadonlySet<string> = new Set(NAME_ONLY_FIELDS);

/** Longest value kept: a printed address fits, a pasted essay does not. */
const MAX_VALUE_LENGTH = 200;

function plain(value: AuditValue): AuditValue {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        return trimmed.length > MAX_VALUE_LENGTH
            ? `${trimmed.slice(0, MAX_VALUE_LENGTH - 1)}…`
            : trimmed;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    return null;
}

/**
 * The changes an audit row may carry: fields on {@link VALUE_FIELDS} only,
 * each value made plain, and only where before and after differ. A
 * personal field, or one on neither list, is dropped whatever it holds.
 */
export function recordableChanges(
    changes: readonly FieldChange[],
): FieldChange[] {
    const kept: FieldChange[] = [];
    for (const change of changes) {
        if (NEVER_VALUES.has(change.field)) continue;
        if (!WITH_VALUES.has(change.field)) continue;
        const before = plain(change.before);
        const after = plain(change.after);
        if (before === after) continue;
        kept.push({ field: change.field, before, after });
    }
    return kept;
}
