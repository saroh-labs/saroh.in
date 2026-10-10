/**
 * The one vocabulary for "can customers get it?".
 *
 * Every kind of thing a business offers (a product, a plan, a course, a
 * class pack, a post, a service, a discount code) is in one of six states,
 * and each state has ONE word, whatever the thing. The thing's own sentence
 * ("Taking bookings", "Open to sign-ups", "On sale") is the hint beside or
 * behind the word, never the word itself.
 *
 * | Word      | Means                                                        |
 * | --------- | ------------------------------------------------------------ |
 * | Draft     | Still being made. Customers have never been offered it.      |
 * | Scheduled | Finished, and set to go live on a date of its own.           |
 * | Live      | Customers can get it now.                                    |
 * | Paused    | Held back by the business. It comes back as it was.          |
 * | Ended     | Ran its course by itself: its date passed or it was used up. |
 * | Archived  | Put away by the business. Kept for the record.               |
 *
 * Only words a merchant reads. The API's values and the database's keep
 * their names (`PUBLISHED`, `OPEN`, `ACTIVE`, `EXHAUSTED`): this file is the
 * one place that turns them into words.
 */
export type Publication =
    "draft" | "scheduled" | "live" | "paused" | "ended" | "archived";

export const PUBLICATION_WORD: Record<Publication, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    live: "Live",
    paused: "Paused",
    ended: "Ended",
    archived: "Archived",
};

/** The badge each state wears. The word says it; the tint only backs it up. */
export const PUBLICATION_TONE: Record<
    Publication,
    "draft" | "info" | "success" | "warning" | "neutral"
> = {
    draft: "draft",
    scheduled: "info",
    live: "success",
    paused: "warning",
    ended: "neutral",
    archived: "neutral",
};

export type Thing =
    "product" | "plan" | "course" | "pack" | "post" | "service" | "discount";

interface Entry {
    state: Publication;
    /** The thing's own sentence for this state. */
    hint: string;
}

const TABLE: Record<Thing, Record<string, Entry>> = {
    product: {
        DRAFT: { state: "draft", hint: "Only the team can see it." },
        PUBLISHED: { state: "live", hint: "Customers can buy it." },
        ARCHIVED: {
            state: "archived",
            hint: "Off the shop. Kept for past orders.",
        },
    },
    plan: {
        DRAFT: { state: "draft", hint: "Not offered yet." },
        ACTIVE: { state: "live", hint: "Open to sign-ups." },
        ARCHIVED: {
            state: "archived",
            hint: "Closed to sign-ups. Subscribers keep it.",
        },
    },
    course: {
        DRAFT: { state: "draft", hint: "Not offered yet." },
        OPEN: { state: "live", hint: "Open for sign-ups." },
        CLOSED: { state: "paused", hint: "Closed to sign-ups." },
        ARCHIVED: { state: "archived", hint: "Put away. Kept for the record." },
    },
    pack: {
        DRAFT: { state: "draft", hint: "Not on sale yet." },
        ACTIVE: { state: "live", hint: "On sale." },
        ARCHIVED: {
            state: "archived",
            hint: "Off sale. Holders keep theirs.",
        },
    },
    post: {
        DRAFT: { state: "draft", hint: "Only the team can see it." },
        PUBLISHED: { state: "live", hint: "On the site." },
        ARCHIVED: { state: "archived", hint: "Taken off the site." },
    },
    // A service has no status of its own, only whether it takes bookings.
    service: {
        TAKING: { state: "live", hint: "Taking bookings." },
        NOT_TAKING: { state: "paused", hint: "Not taking bookings." },
    },
    discount: {
        SCHEDULED: { state: "scheduled", hint: "Starts on its date." },
        ACTIVE: { state: "live", hint: "Customers can use it." },
        EXPIRED: { state: "ended", hint: "Its end date has passed." },
        EXHAUSTED: { state: "ended", hint: "Used up." },
    },
};

export interface PublicationWords {
    state: Publication;
    /** "Draft", "Live": the same for every kind of thing. */
    word: string;
    tone: (typeof PUBLICATION_TONE)[Publication];
    /** The thing's own sentence, for a hint. */
    hint: string;
}

/**
 * What a merchant reads for `status` on a `thing`. An unknown status reads
 * "Draft" rather than claiming customers can get something they may not.
 */
export function publication(thing: Thing, status: string): PublicationWords {
    const entry = TABLE[thing][status] ?? {
        state: "draft" as const,
        hint: "",
    };
    return {
        state: entry.state,
        word: PUBLICATION_WORD[entry.state],
        tone: PUBLICATION_TONE[entry.state],
        hint: entry.hint,
    };
}

/** The word alone, for a filter, a menu row or a sentence. */
export function publicationWord(thing: Thing, status: string): string {
    return publication(thing, status).word;
}
