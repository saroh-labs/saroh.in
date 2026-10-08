import { personHref } from "@/lib/contacts/person-href";

/**
 * Merging two customers (DEC-042, C10), as Customer Detail's dialog draws
 * it: two columns — this record and the other — with a pick per row for the
 * name, email and phone, which one stays, what moves, the offers each
 * channel ends up with, the site account that will see the combined record
 * (ADR-011) and anything that refuses the merge. Pure, so the rules and the
 * copy are tested; the API (`customer-workspace/merge.service.ts`, C9) is
 * the authority and re-checks everything under its locks.
 *
 * The dialog reads two previews at once — one keeping each record — so
 * switching which one stays is instant, and each column can say what it
 * holds ("This record · 6 orders"): what a preview moves is what the record
 * that goes brings.
 */
import type {
    MergeBody,
    MergeColumn,
    MergeField,
    MergeFrom,
    MergePicks,
    MergePreview,
    MergePreviews,
    MergeSide,
    MergeTarget,
} from "./merge-types";
import { MERGE_FIELDS } from "./merge-types";

export type * from "./merge-types";
export { MERGE_FIELDS } from "./merge-types";

const OTHER_COLUMN: Record<MergeColumn, MergeColumn> = {
    here: "there",
    there: "here",
};

/** The column a preview keeps. */
export function keptColumn(preview: MergePreview, hereId: string): MergeColumn {
    return preview.survivorId === hereId ? "here" : "there";
}

/** A column's side in a preview: the one kept, or the one merged in. */
export function sideOf(
    preview: MergePreview,
    hereId: string,
    column: MergeColumn,
): MergeSide {
    return keptColumn(preview, hereId) === column ? "survivor" : "other";
}

export interface MergeRow {
    key: MergeField;
    label: string;
    values: Record<MergeColumn, string | null>;
}

const FIELD_LABEL: Record<MergeField, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
};

/** The three rows the merchant picks from, by column. */
export function mergeRows(preview: MergePreview, hereId: string): MergeRow[] {
    return MERGE_FIELDS.map((key) => ({
        key,
        label: FIELD_LABEL[key],
        values: {
            here: blankToNull(
                preview.choices[key][sideOf(preview, hereId, "here")],
            ),
            there: blankToNull(
                preview.choices[key][sideOf(preview, hereId, "there")],
            ),
        },
    }));
}

/**
 * The picks the dialog opens with: the kept record's value in each row,
 * unless it has none and the other has one — an empty pick never loses a
 * value (as the API does).
 */
export function defaultPicks(
    preview: MergePreview,
    hereId: string,
): MergePicks {
    const kept = keptColumn(preview, hereId);
    const rows = mergeRows(preview, hereId);
    const picks = {} as MergePicks;
    for (const row of rows) {
        picks[row.key] =
            row.values[kept] === null && row.values[OTHER_COLUMN[kept]] !== null
                ? OTHER_COLUMN[kept]
                : kept;
    }
    return picks;
}

/** A pick may not choose a column with nothing in it. */
export function pickable(row: MergeRow, column: MergeColumn): boolean {
    return row.values[column] !== null;
}

/** A column's name: what the record is called, or how the other is known. */
export function columnName(
    previews: MergePreviews,
    hereId: string,
    column: MergeColumn,
    fallback: string | null = null,
): string {
    const p = previews.here;
    const name = blankToNull(p.choices.name[sideOf(p, hereId, column)]);
    return (
        name ??
        fallback ??
        (column === "here" ? "This record" : "Their other record")
    );
}

/**
 * The column's heading: "This record · 6 orders", "Priya R. · 1 order".
 * What a record holds is what a preview keeping the other one moves.
 */
export function columnHeading(
    previews: MergePreviews,
    hereId: string,
    column: MergeColumn,
    fallback: string | null = null,
): string {
    const title =
        column === "here"
            ? "This record"
            : columnName(previews, hereId, "there", fallback);
    const holds = previews[OTHER_COLUMN[column]].moves;
    return holds.length ? `${title} · ${holds[0].label}` : title;
}

/** "a, b and c" */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * What the note under the rows says moves: "1 order, 2 notes and 1
 * booking move to Priya Raman, and the other record goes away."
 */
export function movesLine(preview: MergePreview, keptName: string): string {
    const labels = preview.moves.map((m) => m.label);
    if (labels.length === 0) {
        return `The other record has nothing to move, and it goes away. ${keptName} stays.`;
    }
    const one = preview.moves.length === 1 && preview.moves[0].count === 1;
    return `${list(labels)} ${one ? "moves" : "move"} to ${keptName}, and the other record goes away.`;
}

const CHANNEL_WORD: Record<MergePreview["consent"][number]["channel"], string> =
    {
        EMAIL: "Offers by email",
        WHATSAPP: "Offers on WhatsApp",
    };

/**
 * Offers per channel after the merge, as the picks leave it (default 24):
 * the email pick decides email, the phone pick WhatsApp. A channel neither
 * record has an answer for is left out.
 */
export function consentLines(
    preview: MergePreview,
    hereId: string,
    picks: MergePicks,
    names: Record<MergeColumn, string>,
): string[] {
    const lines: string[] = [];
    for (const c of preview.consent) {
        const { survivor, other } = c.ifKept;
        if (survivor.status === null && other.status === null) continue;
        const column = c.channel === "EMAIL" ? picks.email : picks.phone;
        const outcome = c.ifKept[sideOf(preview, hereId, column)];
        const word = CHANNEL_WORD[c.channel];
        if (outcome.status === null) {
            lines.push(`${word}: not asked — they'll need to say yes again`);
            continue;
        }
        const answer = outcome.status === "GRANTED" ? "Yes" : "No";
        const fromColumn = outcome.from
            ? outcome.from === "survivor"
                ? keptColumn(preview, hereId)
                : OTHER_COLUMN[keptColumn(preview, hereId)]
            : null;
        const from =
            fromColumn === "here"
                ? " — from this record"
                : fromColumn === "there"
                  ? ` — from ${names.there}'s record`
                  : "";
        lines.push(`${word}: ${answer}${from}`);
    }
    return lines;
}

/** What the dialog says and asks about the site account (ADR-011). */
export interface AccountView {
    /** The lines to show, in order. */
    lines: string[];
    /** "Don't carry the sign-in over" is a choice here. */
    canLeaveBehind: boolean;
    /** Merge waits for "I've checked this email is theirs". */
    needsConfirm: boolean;
}

export function accountView(
    preview: MergePreview,
    carry: boolean,
): AccountView {
    const plan = carry ? preview.account.carried : preview.account.notCarried;
    return {
        lines: [plan.seesCombined, plan.stopsReaching].filter(
            (l): l is string => !!l,
        ),
        canLeaveBehind: preview.account.carried.action === "move",
        needsConfirm: plan.confirmationRequired,
    };
}

/** Why Merge is off, in words; null when it may go ahead. */
export function mergeBlock(
    preview: MergePreview,
    carry: boolean,
    confirmed: boolean,
): string | null {
    if (preview.refusals.length > 0) return preview.refusals[0].message;
    if (accountView(preview, carry).needsConfirm && !confirmed) {
        return "Tick that you've checked the email first.";
    }
    return null;
}

/** What the dialog sends. */
export function mergeBody(
    preview: MergePreview,
    hereId: string,
    picks: MergePicks,
    carry: boolean,
    confirmed: boolean,
): MergeBody {
    const side = (f: MergeField) => sideOf(preview, hereId, picks[f]);
    return {
        survivorId: preview.survivorId,
        name: side("name"),
        email: side("email"),
        phone: side("phone"),
        carryAccount: carry,
        accountConfirmed: confirmed,
    };
}

/**
 * A suggested duplicate, in a line: "Priya R. (priya@example.in) has the
 * same phone. They sign in on your website."
 */
export function duplicateLine(d: {
    name: string | null;
    email: string | null;
    matchedOn: readonly ("email" | "phone")[];
    signsIn: boolean;
}): string {
    const who = d.name?.trim()
        ? d.email
            ? `${d.name.trim()} (${d.email})`
            : d.name.trim()
        : (d.email ?? "Another record");
    const on = d.matchedOn.includes("email")
        ? d.matchedOn.includes("phone")
            ? "email and phone"
            : "email"
        : "phone";
    const signs = d.signsIn ? " They sign in on your website." : "";
    return `${who} has the same ${on}.${signs}`;
}

/**
 * The duplicates a contact page shows as a prompt (DEC-097). A same-email
 * record (compared without case) is "This may be the same person", for
 * whoever can edit contacts; a phone-only pair keeps C2's quieter "Looks
 * like the same person". `emailOnly` is the Contacts page, which offers
 * only the email prompt. Nothing here merges: staff choose to.
 */
export function shownDuplicates<
    T extends { matchedOn: readonly ("email" | "phone")[] },
>(
    duplicates: readonly T[],
    { canEdit, emailOnly = false }: { canEdit: boolean; emailOnly?: boolean },
): T[] {
    return duplicates.filter((d) =>
        d.matchedOn.includes("email") ? canEdit : !emailOnly,
    );
}

/** The prompt's lead-in for a suggested duplicate (DEC-097, C2). */
export function duplicateHeading(d: {
    matchedOn: readonly ("email" | "phone")[];
}): string {
    return d.matchedOn.includes("email")
        ? "This may be the same person:"
        : "Looks like the same person:";
}

/** A suggested duplicate (C2) as the record to merge with. */
export function suggestedTarget(d: {
    contactId: string;
    name: string | null;
    email: string | null;
}): MergeTarget {
    return {
        contactId: d.contactId,
        name: d.name ?? d.email,
        from: "suggestion",
    };
}

/** Whoever holds the email the edit sheet tried to give (C8's 409). */
export function clashTarget(holder: {
    contactId: string;
    name: string | null;
}): MergeTarget {
    return { contactId: holder.contactId, name: holder.name, from: "clash" };
}

/** The words under the title. */
export function mergeSubtitle(from: MergeFrom, otherName: string): string {
    switch (from) {
        case "suggestion":
            return "We found one record that looks like the same person.";
        case "clash":
            return `${otherName} already has that email. If they're the same person, merge the two records.`;
        default:
            return `Merging this record with ${otherName}.`;
    }
}

/** The toast once it's done. */
export function mergedToast(mergedName: string): string {
    return `Merged. All of ${mergedName}'s orders, bookings and notes are here now.`;
}

/**
 * Where an old address goes after a merge (C9's `{ mergedInto }`): the
 * survivor's page, on the same tab.
 */
export function mergedRedirectPath(mergedInto: string, tab?: string): string {
    return personHref(mergedInto, tab);
}

/** The detail read's answer for a merged-away record. */
export interface MergedRedirect {
    mergedInto: string;
}

export function isMergedRedirect(value: unknown): value is MergedRedirect {
    return (
        !!value &&
        typeof value === "object" &&
        typeof (value as { mergedInto?: unknown }).mergedInto === "string" &&
        !("contact" in value)
    );
}

function blankToNull(value: string | null | undefined): string | null {
    return value?.trim() ? value : null;
}
