import { kindOf } from "@/lib/organizations/kind";
import { sameWeek } from "@/lib/organizations/opening-hours";
import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import type {
    OrganizationSettings,
    OrganizationSettingsInput,
    TaxSettingsInput,
} from "./settings-service";

/**
 * Undo on a Settings save (F12, R11): the way back is the same save, sent
 * with the values the business had before. It goes through the same action
 * and the same API, so it is checked and audited as a change of its own.
 *
 * Pure: what the Undo sends, what it expects to find, and when it is
 * refused. The ten-second window is `lib/hold-undo.ts`; the toast and the
 * save are the screen's.
 *
 * Undo is not offered for a change a save cannot put back:
 * - a number format chosen for the first time: the API has no "follow the
 *   registration again", so writing the old one back would pin it;
 * - a logo that was only ever an address (no library image to point at);
 * - hours a storefront never had (the API keeps a week, never "none");
 * - a read the save could not see (an older API that sent no tax or
 *   address).
 *
 * And it is refused, when pressed, if what it would overwrite is no longer
 * what this save left: someone changed it since (another tab, another
 * person), or an invoice has been numbered since a change to how invoices
 * are numbered or taxed.
 */

/** Said when the saved value has changed under the Undo. */
export const CHANGED_SINCE = "Changed since — reload";

/** Said when an invoice was numbered since a tax or numbering change. */
export const NUMBERED_SINCE =
    "An invoice has been numbered since, so this can't be undone";

/** What pressing Undo sends, and what it expects to find first. */
export interface SettingsUndo {
    /** The save that puts the previous values back. */
    input: OrganizationSettingsInput;
    /** Each touched field as this save left it, by its path. */
    expect: Record<string, unknown>;
    /**
     * The invoice counters as this save left them, when the save changed
     * the registration or the numbering: a number taken since fixes it.
     */
    counters: Record<string, number> | null;
}

type TaxKey = keyof TaxSettingsInput;

const TAX_READ: Record<Exclude<TaxKey, "invoiceNumber">, TaxField> = {
    registered: "registered",
    state: "state",
    invoicePrefix: "invoicePrefix",
    deliveryRate: "deliveryRate",
    deliverySac: "deliverySac",
};
type TaxField =
    "registered" | "state" | "invoicePrefix" | "deliveryRate" | "deliverySac";

const keysOf = <T extends object>(o: T | undefined) =>
    (o ? Object.keys(o) : []) as (keyof T)[];

/** The number format as saved, when the business chose one. */
function chosenFormat(s: OrganizationSettings) {
    const n = s.tax?.invoiceNumber;
    if (!n) return null;
    return {
        parts: n.parts,
        separator: n.separator,
        digits: n.digits,
        restart: n.restart,
    };
}

/**
 * Every field a save touched, by path ("profile.type", "tax.invoicePrefix"),
 * as `settings` has it. Two reads of the same save compare equal.
 */
export function touchedFields(
    settings: OrganizationSettings,
    sent: OrganizationSettingsInput,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (sent.name !== undefined) out.name = settings.name;
    if (sent.kind !== undefined) out.kind = kindOf(settings.kind);
    for (const key of keysOf(sent.profile)) {
        out[`profile.${key}`] = settings.profile?.[key] ?? null;
    }
    for (const key of keysOf(sent.tax)) {
        out[`tax.${key}`] =
            key === "invoiceNumber"
                ? chosenFormat(settings)
                : (settings.tax?.[TAX_READ[key]] ?? null);
    }
    for (const key of keysOf(sent.registeredAddress)) {
        out[`registeredAddress.${key}`] =
            settings.registeredAddress?.[key] ?? null;
    }
    return out;
}

/** A save that changes how invoices are taxed or numbered. */
const touchesNumbering = (sent: OrganizationSettingsInput) =>
    sent.tax?.registered !== undefined ||
    sent.tax?.invoicePrefix !== undefined ||
    sent.tax?.invoiceNumber !== undefined;

/**
 * The Undo for a save: `before` is what the screen read, `after` what the
 * save returned, `sent` what it sent. `null` when a save cannot put it back.
 */
export function settingsUndo(
    before: OrganizationSettings,
    after: OrganizationSettings,
    sent: OrganizationSettingsInput,
): SettingsUndo | null {
    // Tax and address fields written back need the read they came from.
    if (sent.tax && !before.tax) return null;
    if (sent.registeredAddress && !before.registeredAddress) return null;
    // A format never chosen follows the registration; writing it back
    // would choose it (see above).
    if (sent.tax?.invoiceNumber && !before.tax?.invoiceNumber?.custom) {
        return null;
    }

    const input: OrganizationSettingsInput = {};
    if (sent.name !== undefined) input.name = before.name;
    // An API older than DEC-070 sent none: it was a business.
    if (sent.kind !== undefined) input.kind = kindOf(before.kind);
    if (sent.profile) {
        input.profile = Object.fromEntries(
            keysOf(sent.profile).map((key) => [
                key,
                before.profile?.[key] ?? "",
            ]),
        );
    }
    if (sent.tax && before.tax) {
        const tax = before.tax;
        const back: TaxSettingsInput = {};
        for (const key of keysOf(sent.tax)) {
            if (key === "registered") back.registered = tax.registered;
            else if (key === "invoiceNumber") {
                back.invoiceNumber = chosenFormat(before) ?? undefined;
            } else back[key] = String(tax[TAX_READ[key]] ?? "");
        }
        input.tax = back;
    }
    if (sent.registeredAddress && before.registeredAddress) {
        const address = before.registeredAddress;
        input.registeredAddress = Object.fromEntries(
            keysOf(sent.registeredAddress).map((key) => [
                key,
                address[key] ?? "",
            ]),
        );
    }

    return {
        input,
        expect: touchedFields(after, sent),
        counters: touchesNumbering(sent)
            ? { ...(after.tax?.invoiceNumber?.counters ?? {}) }
            : null,
    };
}

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * Why an Undo is refused against the settings as they are now, or `null`
 * when it may go ahead. The fields it would write are compared with what
 * the save left; its own input names the same fields as the save did.
 */
export function undoRefusal(
    undo: SettingsUndo,
    current: OrganizationSettings,
): string | null {
    if (!same(touchedFields(current, undo.input), undo.expect)) {
        return CHANGED_SINCE;
    }
    if (
        undo.counters &&
        !same(
            { ...(current.tax?.invoiceNumber?.counters ?? {}) },
            undo.counters,
        )
    ) {
        return NUMBERED_SINCE;
    }
    return null;
}

/** The Undo for a logo set or taken off: which library image to point at. */
export interface LogoUndo {
    /** The image to put back, or `null` to take the logo off. */
    mediaId: string | null;
    /** The image this save left, or `null` for none. */
    expect: string | null;
}

export function logoUndo(
    before: OrganizationSettings,
    after: OrganizationSettings,
): LogoUndo | null {
    // An older API that sends no logo: nothing known to put back.
    if (before.logo === undefined) return null;
    // A logo kept only as an address has no image to point at again.
    if (before.logo && !before.logo.mediaId) return null;
    return {
        mediaId: before.logo?.mediaId ?? null,
        expect: after.logo?.mediaId ?? null,
    };
}

export function logoUndoRefusal(
    undo: LogoUndo,
    current: OrganizationSettings,
): string | null {
    return (current.logo?.mediaId ?? null) === undo.expect
        ? null
        : CHANGED_SINCE;
}

/** One storefront's week, before and after an Hours save. */
export interface HoursUndoEntry {
    id: string;
    before: OpeningHoursDay[];
    after: OpeningHoursDay[] | null;
}

/**
 * The Undo for an Hours save: every storefront's week as it was. `null`
 * when one had none (the API keeps a week, never "none").
 */
export function hoursUndo(
    stores: readonly {
        id: string;
        before: OpeningHoursDay[] | null;
        after: OpeningHoursDay[] | null;
    }[],
): HoursUndoEntry[] | null {
    if (stores.length === 0) return null;
    const entries: HoursUndoEntry[] = [];
    for (const s of stores) {
        if (!s.before) return null;
        entries.push({ id: s.id, before: s.before, after: s.after });
    }
    return entries;
}

export function hoursUndoRefusal(
    entries: readonly HoursUndoEntry[],
    current: readonly { id: string; openingHours: OpeningHoursDay[] | null }[],
): string | null {
    for (const entry of entries) {
        const now = current.find((s) => s.id === entry.id);
        if (!now || !sameWeek(now.openingHours, entry.after)) {
            return CHANGED_SINCE;
        }
    }
    return null;
}
