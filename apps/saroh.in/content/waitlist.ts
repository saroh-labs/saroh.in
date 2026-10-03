/**
 * The waitlist page's content (Waitlist design, plan U30): the kinds of
 * business it asks about, the opening date and the launch offer.
 *
 * The date and the offer are content, not copy in the components (KTD-16),
 * and both are open until the owner sets them:
 * - `openingDate` is null until the open launch is scheduled (OQ-12), and
 *   the header says "Opening soon" instead of a date.
 * - `offer` is null here. The page reads the launch offer from the API
 *   (`GET /public/waitlist/offer`, `lib/launch-offer.ts`) — the same
 *   `LAUNCH_OFFER_DAYS` and plan the opening-day invites carry — and builds
 *   its lines with `launchOfferLines`. With none, the form says "Offer
 *   details announced at launch". The repo is public: the words are here,
 *   the plan's name and the number of days only ever come from the API.
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

/** The launch offer as the API answers it: the plan's name and the days. */
export interface LaunchOfferTerms {
    planName: string;
    days: number;
}

/**
 * The offer's lines from the API's numbers (OQ-1, DEC-075): the plan free
 * for the offer's length, no card, and Free afterwards unless the business
 * chooses a plan — what an invite's offer does (a time-bound plan override
 * that lapses to Free).
 */
export function launchOfferLines({
    planName,
    days,
}: LaunchOfferTerms): WaitlistOffer {
    const offer = `${days} days of ${planName} free`;
    return {
        headline: offer,
        terms: "No card needed. When it ends, you stay on Free unless you choose a plan.",
        doneLine: `Your invite comes with ${offer}.`,
    };
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
};
