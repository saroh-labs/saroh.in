/**
 * The merge's shapes (C9's preview and result, C10's dialog state).
 * `merge.ts` re-exports them beside the rules that read them.
 */

export type MergeSide = "survivor" | "other";

/** A column of the dialog: this page's record, or the other one. */
export type MergeColumn = "here" | "there";

export type MergeField = "name" | "email" | "phone";

export const MERGE_FIELDS: readonly MergeField[] = ["name", "email", "phone"];

export interface MergeMove {
    key: string;
    count: number;
    /** "2 orders", "1 note". */
    label: string;
}

export interface MergeConsentOutcome {
    /** null: "not asked" until the person says yes again. */
    status: "GRANTED" | "REVOKED" | null;
    from: MergeSide | null;
}

export interface MergeAccountPreview {
    action: "none" | "keep" | "move" | "retire";
    /** "a•••@gmail.com signs in on your website and will see everything here". */
    seesCombined: string | null;
    /** "o•••@x.in will be asked to sign in with a•••@gmail.com instead". */
    stopsReaching: string | null;
    confirmationRequired: boolean;
}

export interface MergeRefusal {
    reason: string;
    message: string;
}

/** `GET …/customers/:contactId/merge/:otherId/preview?survivorId=`. */
export interface MergePreview {
    survivorId: string;
    otherId: string;
    moves: MergeMove[];
    choices: Record<MergeField, Record<MergeSide, string | null>>;
    consent: {
        channel: "EMAIL" | "WHATSAPP";
        ifKept: Record<MergeSide, MergeConsentOutcome>;
    }[];
    account: {
        carried: MergeAccountPreview;
        notCarried: MergeAccountPreview;
    };
    refusals: MergeRefusal[];
}

/** Both previews: one keeping this record, one keeping the other. */
export interface MergePreviews {
    here: MergePreview;
    there: MergePreview;
}

/** `POST …/customers/:contactId/merge/:otherId`. */
export interface MergeBody {
    survivorId: string;
    name: MergeSide;
    email: MergeSide;
    phone: MergeSide;
    carryAccount: boolean;
    accountConfirmed: boolean;
}

export interface MergeResult {
    survivorId: string;
    mergedId: string;
    moves: MergeMove[];
}

/** Which column holds each value the survivor takes. */
export type MergePicks = Record<MergeField, MergeColumn>;

/** Where the merge is opened from: the words under the title differ. */
export type MergeFrom = "suggestion" | "search" | "clash";

/** The record the dialog merges with this one. */
export interface MergeTarget {
    contactId: string;
    name: string | null;
    from: MergeFrom;
}
