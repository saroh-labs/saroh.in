import type { AuditValue, FieldChange } from "../audit/audit-changes";
import { recordableChanges } from "../audit/audit-changes";
import { bpsToRate, rateToBps } from "../invoices/gst";
import { stateName } from "../invoices/gst-states";
import type { NumberRestart } from "../invoices/numbering";
import { numberFormatFor, seriesFor } from "../invoices/numbering";

/**
 * A settings save as the audit stream says it (#509): each business detail
 * as it was and as it became, printed the way a person reads it — the state
 * by its name, GST on delivery as "18%", the number format as the number it
 * prints, the registered address as one line. Which fields may carry a
 * value is `audit/audit-changes.ts`'s decision, not this file's.
 */

/** What the snapshot reads: the organization's name and its profile. */
export interface SettingsRow {
    name: string;
    businessProfile: {
        legalName?: string | null;
        type?: string | null;
        country?: string | null;
        taxId?: string | null;
        timezone?: string | null;
        gstRegistered?: boolean | null;
        gstState?: string | null;
        invoicePrefix?: string | null;
        invoiceNumberFormat?: unknown;
        deliveryGstRate?: { toString(): string } | null;
        deliverySacCode?: string | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        city?: string | null;
        postalCode?: string | null;
    } | null;
}

/** The columns that make up the one registered address. */
const ADDRESS_COLUMNS = new Set([
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
]);

const RESTART_WORDS: Record<NumberRestart, string> = {
    FY: "new count each financial year",
    MONTH: "new count each month",
    NEVER: "one running count",
};

/**
 * The number a format prints first — "RC/26-27/0001" — and how often it
 * starts again, so two formats that print alike still read apart.
 */
function numberExample(
    p: NonNullable<SettingsRow["businessProfile"]>,
    at: Date,
): string | null {
    const registered = p.gstRegistered ?? false;
    try {
        const series = seriesFor({
            registered,
            prefix: p.invoicePrefix ?? null,
            kind: "INVOICE",
            at,
            timezone: p.timezone,
            format: p.invoiceNumberFormat,
        });
        const { restart } = numberFormatFor(p.invoiceNumberFormat, registered);
        return `${series.format(1)} · ${RESTART_WORDS[restart]}`;
    } catch {
        // A format too long to print is still a change; say so plainly.
        return null;
    }
}

/** "14 Hill Road, Indiranagar, Bengaluru 560038", or null when blank. */
function printedAddress(
    p: NonNullable<SettingsRow["businessProfile"]>,
): string | null {
    const town = [p.city, p.postalCode]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    const line = [p.addressLine1, p.addressLine2, town]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ");
    return line || null;
}

/** Every business detail that may carry a value, as it reads now. */
export function settingsSnapshot(
    row: SettingsRow | null,
    at: Date = new Date(),
): Record<string, AuditValue> {
    const p = row?.businessProfile ?? {};
    const rate = rateToBps(p.deliveryGstRate ?? null);
    return {
        name: row?.name ?? null,
        legalName: p.legalName ?? null,
        type: p.type ?? null,
        country: p.country ?? null,
        timezone: p.timezone ?? null,
        gstRegistered: p.gstRegistered ?? false,
        taxId: p.taxId ?? null,
        gstState: stateName(p.gstState) ?? p.gstState ?? null,
        invoicePrefix: p.invoicePrefix ?? null,
        invoiceNumberFormat: numberExample(p, at),
        deliveryGstRate: rate === null ? null : `${bpsToRate(rate)}%`,
        deliverySacCode: p.deliverySacCode ?? null,
        registeredAddress: printedAddress(p),
    };
}

/**
 * The values a save changed, from the columns it wrote: the four address
 * columns are one registered address. Only what may carry a value, and
 * only what differs, survives {@link recordableChanges}.
 */
export function settingsChanges(
    columns: readonly string[],
    before: Record<string, AuditValue>,
    after: Record<string, AuditValue>,
): FieldChange[] {
    const fields = new Set(
        columns.map((c) => (ADDRESS_COLUMNS.has(c) ? "registeredAddress" : c)),
    );
    return recordableChanges(
        [...fields].map((field) => ({
            field,
            before: before[field] ?? null,
            after: after[field] ?? null,
        })),
    );
}
