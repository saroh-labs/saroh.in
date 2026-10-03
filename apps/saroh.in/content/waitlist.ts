/**
 * The waitlist page's content (Waitlist design, plan U30): the kinds of
 * business it asks about, the opening date and the launch offer.
 *
 * The date and the offer are content, not copy in the components (KTD-16),
 * and both are open until the owner sets them:
 * - `openingDate` is null until the open launch is scheduled (OQ-12), and
 *   the header says "Opening soon" instead of a date.
 * - `offer` is null until the launch offer is settled; the form then says
 *   "Offer details announced at launch". The repo is public: no plan
 *   lengths, prices or terms are written here until they are announced.
 */

/** A kind of business, as the API stores it (`WAITLIST_KINDS`) and the form names it. */
export interface WaitlistKind {
    id: WaitlistKindId;
    label: string;
}

export type WaitlistKindId =
    | "salon"
    | "gym"
    | "clinic"
    | "coach"
    | "food"
    | "shop"
    | "creator"
    | "other";

/** The form's eight kinds, in the design's order. */
export const WAITLIST_KINDS: readonly WaitlistKind[] = [
    { id: "salon", label: "Salon or beauty" },
    { id: "gym", label: "Gym or studio" },
    { id: "clinic", label: "Clinic" },
    { id: "coach", label: "Dietician or coach" },
    { id: "food", label: "Bakery or food" },
    { id: "shop", label: "Shop" },
    { id: "creator", label: "Creator" },
    { id: "other", label: "Something else" },
];

/** "For people who run": the first seven, without "Something else". */
export const HERO_KINDS = WAITLIST_KINDS.slice(0, 7);

/** The launch offer, once announced. Each line is shown as written. */
export interface WaitlistOffer {
    /** Bold in the card's lead: "Get ‹headline› when we open." */
    headline: string;
    /** After the headline, in the lead's weight. */
    aside?: string;
    /** The offer's terms, after the email promise under the button. */
    terms: string;
    /** The done state's line after the email promise. */
    doneLine: string;
}

export interface WaitlistContent {
    /** The opening day, `YYYY-MM-DD` in India time, or null: "Opening soon". */
    openingDate: string | null;
    offer: WaitlistOffer | null;
}

export const WAITLIST: WaitlistContent = {
    openingDate: null,
    offer: null,
};

/** The card's lead and the line under it while no offer is announced. */
export const NO_OFFER = {
    headline: "early access",
    note: "Offer details announced at launch.",
};

/** Where someone writes to be taken off the list (KTD-17). */
export const WAITLIST_CONTACT = "hello@saroh.in";

/** The footer's meaning of the name, and where Saroh is. */
export const WAITLIST_FOOTER = {
    word: "सारोह",
    meaning: "sa (with) + aaroh (rising) · Let's rise together.",
    social: "@sarohlabs · Instagram · X · YouTube · LinkedIn",
};
