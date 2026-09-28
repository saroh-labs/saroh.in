import { dayText } from "@/lib/subscriptions/view";

/**
 * Needs attention on Customer Detail and the Customers list (DEC-040, C5):
 * what the tags say, what the editor starts from and checks, and what it
 * sends to C1's routes. Pure, so the screen, the list and the tests share it.
 *
 * The API decides what a viewer sees: a sensitive entry is left out for a
 * role without the sensitive permission and only counted
 * (`hiddenSensitiveCount`). Nothing here filters on its own.
 */

export type AttentionKind = "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";
export type AttentionSource = "STAFF" | "BOOKING_PAGE" | "CUSTOMER";

/** One entry, as C1's read gives it. */
export interface AttentionEntry {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    allergen: { id: string; name: string } | null;
    source: AttentionSource;
    status: "SUGGESTED" | "ACTIVE";
    /** The booking whose note suggested it (C12). */
    bookingId?: string | null;
    createdByUserId: string | null;
    /** Who added it, by name; null for the booking page or the customer. */
    addedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Customer Detail's `attention` block (C1). */
export interface DetailAttention {
    from: "contact";
    entries: AttentionEntry[];
    /** Entries on the record this viewer may not see. */
    hiddenSensitiveCount: number;
    /** Waiting for staff (C12 draws them); only for someone who can add them. */
    suggestions?: AttentionEntry[];
}

/** A tag on a Customers list row (C3's `attention`): never its detail. */
export interface AttentionTagInput {
    kind: AttentionKind;
    label: string;
    sensitive?: boolean;
}

/** The limits C1's DTO holds a label and a detail to. */
export const LABEL_MAX = 60;
export const DETAIL_MAX = 500;

export const KIND_WORD: Record<AttentionKind, string> = {
    ALLERGY: "Allergy",
    MEDICAL: "Medical",
    ACCESS: "Access",
    OTHER: "Other",
};

/** The editor's kinds, in the design's order, with Other last. */
export const EDITOR_KINDS: AttentionKind[] = [
    "MEDICAL",
    "ALLERGY",
    "ACCESS",
    "OTHER",
];

/** "Allergy: Sesame", "Medical: Pregnant" — the words, never colour alone. */
export function tagText(e: AttentionTagInput): string {
    return `${KIND_WORD[e.kind]}: ${e.label}`;
}

const FROM: Record<AttentionSource, string | null> = {
    STAFF: null,
    BOOKING_PAGE: "from the booking page",
    CUSTOMER: "from the customer",
};

/**
 * The tag's title: its detail, or the label, and where it came from —
 * "Takes warfarin · from the booking page". Only ever a repeat of what the
 * Needs attention card says, never the only place it is said.
 */
export function tagTitle(
    e: Pick<AttentionEntry, "label" | "detail" | "source">,
): string {
    const from = FROM[e.source];
    const what = e.detail?.trim() ? e.detail.trim() : e.label;
    return from ? `${what} · ${from}` : what;
}

/**
 * "1 more note you can't see" beside tags the viewer can see, "1 note you
 * can't see" when there are none; null when nothing is hidden.
 */
export function hiddenText(hidden: number, shown: number): string | null {
    if (hidden <= 0) return null;
    const notes = hidden === 1 ? "note" : "notes";
    return shown > 0
        ? `${hidden} more ${notes} you can't see`
        : `${hidden} ${notes} you can't see`;
}

/**
 * A list row's tags: every entry the API sent this viewer, and the hidden
 * line. The list's Medical tags only reach a role with the sensitive
 * permission because the API sends them only to one.
 */
export function rowTags(row: {
    attention: AttentionTagInput[];
    hiddenSensitiveCount: number;
}): { tags: string[]; hidden: string | null } {
    return {
        tags: row.attention.map(tagText),
        hidden: hiddenText(row.hiddenSensitiveCount, row.attention.length),
    };
}

/**
 * Who added it and when, for the card: "Added by You · 18 Sep",
 * "From the booking page · 18 Sep".
 */
export function entryMeta(
    e: Pick<
        AttentionEntry,
        "source" | "createdByUserId" | "addedBy" | "createdAt"
    >,
    userId: string | null,
    timeZone: string,
    now: Date,
): string {
    const day = dayText(e.createdAt, timeZone, now);
    const from = FROM[e.source];
    if (from) return `${from[0].toUpperCase()}${from.slice(1)} · ${day}`;
    const who =
        e.createdByUserId && e.createdByUserId === userId
            ? "You"
            : (e.addedBy?.split(" ")[0] ?? null);
    return who ? `Added by ${who} · ${day}` : `Added ${day}`;
}

// ---------------------------------------------------------------- editor

/** What the editor holds while it is open. */
export interface AttentionDraft {
    kind: AttentionKind;
    label: string;
    detail: string;
    sensitive: boolean;
    /** Set by hand: picking a kind no longer changes it. */
    sensitiveSet: boolean;
    /** An allergen from the business's list; only for Allergy. */
    allergenId: string | null;
}

interface Choice {
    id: string;
    name: string;
}

const nameKey = (name: string) => name.trim().toLowerCase();

/** A new entry starts as the design's does: Medical, and sensitive. */
export function emptyDraft(): AttentionDraft {
    return {
        kind: "MEDICAL",
        label: "",
        detail: "",
        sensitive: true,
        sensitiveSet: false,
        allergenId: null,
    };
}

/**
 * An entry, to edit. Its allergen is matched to the business's list by name,
 * since the list offers one of each name.
 */
export function draftFrom(
    e: AttentionEntry,
    choices: Choice[],
): AttentionDraft {
    const named = e.allergen;
    const allergen = named
        ? (choices.find((c) => nameKey(c.name) === nameKey(named.name))?.id ??
          named.id)
        : null;
    return {
        kind: e.kind,
        label: e.label,
        detail: e.detail ?? "",
        sensitive: e.sensitive,
        sensitiveSet: true,
        allergenId: allergen,
    };
}

/** Pick a kind: Medical is sensitive by default, unless ticked by hand. */
export function pickKind(
    draft: AttentionDraft,
    kind: AttentionKind,
): AttentionDraft {
    return {
        ...draft,
        kind,
        sensitive: draft.sensitiveSet ? draft.sensitive : kind === "MEDICAL",
    };
}

/** The allergen is picked from the list, when the business has one. */
export function picksAllergen(
    draft: Pick<AttentionDraft, "kind">,
    choices: Choice[],
): boolean {
    return draft.kind === "ALLERGY" && choices.length > 0;
}

export type DraftField = "label" | "detail" | "allergenId";

/**
 * The first thing the draft must fix, on the field it is about; null when it
 * can be sent. The same rules C1 holds, so the sheet says them first.
 */
export function draftProblem(
    draft: AttentionDraft,
    choices: Choice[],
): { field: DraftField; message: string } | null {
    if (picksAllergen(draft, choices)) {
        if (!draft.allergenId) {
            return {
                field: "allergenId",
                message: "Pick what they're allergic to.",
            };
        }
    } else if (!draft.label.trim()) {
        return {
            field: "label",
            message:
                draft.kind === "ALLERGY"
                    ? "Say what they're allergic to."
                    : "Say what the team should know.",
        };
    } else if (draft.label.trim().length > LABEL_MAX) {
        return {
            field: "label",
            message: `Keep it under ${LABEL_MAX} characters; add the rest as detail.`,
        };
    }
    if (draft.detail.trim().length > DETAIL_MAX) {
        return {
            field: "detail",
            message: `Keep the detail under ${DETAIL_MAX} characters.`,
        };
    }
    return null;
}

/** What C1's POST and PATCH take. */
export interface AttentionInput {
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    allergenId: string | null;
}

/**
 * The draft, as sent. An allergen picked from the list names the entry, so
 * its label is left for the API to fill with the allergen's name.
 */
export function toInput(
    draft: AttentionDraft,
    choices: Choice[],
): AttentionInput {
    const fromList = picksAllergen(draft, choices);
    return {
        kind: draft.kind,
        label: fromList ? "" : draft.label.trim(),
        detail: draft.detail.trim() ? draft.detail.trim() : null,
        sensitive: draft.sensitive,
        allergenId: fromList ? draft.allergenId : null,
    };
}

/** Whether the draft says anything other than where it started. */
export function draftChanged(a: AttentionDraft, b: AttentionDraft): boolean {
    return (
        a.kind !== b.kind ||
        a.label.trim() !== b.label.trim() ||
        a.detail.trim() !== b.detail.trim() ||
        a.sensitive !== b.sensitive ||
        a.allergenId !== b.allergenId
    );
}

/** What the tag of a draft will read, for the saved toast. */
export function draftTag(draft: AttentionDraft, choices: Choice[]): string {
    const label = picksAllergen(draft, choices)
        ? (choices.find((c) => c.id === draft.allergenId)?.name ?? "")
        : draft.label.trim();
    return tagText({ kind: draft.kind, label });
}

// ------------------------------------------------- booking-page notes (C12)

/** The kinds the booking-page card offers, as the design draws them. */
export const SUGGESTION_KINDS: AttentionKind[] = [
    "MEDICAL",
    "ALLERGY",
    "ACCESS",
];

/** The card's "Short label for the team" is kept short, as in the design. */
export const SUGGESTION_LABEL_MAX = 40;

/**
 * A note from the booking page, to add: the label the API suggested (its
 * first words), Medical unless it was suggested as another of the card's
 * kinds, and sensitive — which then follows Medical until someone ticks it
 * by hand, as in the editor. The booker's words stay the detail.
 */
export function suggestionDraft(
    e: AttentionEntry,
    choices: Choice[],
): AttentionDraft {
    const kind = SUGGESTION_KINDS.includes(e.kind) ? e.kind : "MEDICAL";
    return {
        ...draftFrom(e, choices),
        kind,
        label: Array.from(e.label).slice(0, SUGGESTION_LABEL_MAX).join(""),
        sensitiveSet: false,
    };
}

/** What the confirm route takes (C12). */
export interface SuggestionInput {
    kind: AttentionKind;
    label: string;
    sensitive: boolean;
    allergenId: string | null;
}

/** The card's draft, as sent: the detail is the booker's and isn't sent. */
export function toSuggestionInput(
    draft: AttentionDraft,
    choices: Choice[],
): SuggestionInput {
    const { detail: _detail, ...rest } = toInput(draft, choices);
    return rest;
}

/**
 * The card's heading: "1 note from the booking page". Only someone who may
 * read them is sent any, so there is never a count of notes they can't.
 */
export function suggestionsTitle(count: number): string {
    return `${count} ${count === 1 ? "note" : "notes"} from the booking page`;
}

/** "Rahul wrote this when booking online, 18 Sep at 10:42". */
export function suggestionWhen(
    first: string | null,
    createdAt: string,
    timeZone: string,
    now: Date,
): string {
    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(createdAt));
    const who = first?.trim() ? first.trim() : "They";
    return `${who} wrote this when booking online, ${dayText(createdAt, timeZone, now)} at ${time}`;
}

/** A field the API named in a refusal, if the sheet has one like it. */
export function fieldOf(field: string | undefined): DraftField | null {
    return field === "label" || field === "detail" || field === "allergenId"
        ? field
        : null;
}
