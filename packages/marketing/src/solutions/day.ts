import type { ClaimSwitch } from "../content/feature-switches";
import type { WorldBusiness } from "../content/world";
import type { HomeMoment, MomentData, WaitingMoment } from "./moments/types";
import type { Words } from "./words";

/**
 * A written day (DEC-221): the shape a trade page tells hour by hour. Each
 * edition writes its days in its own content (saroh.in's
 * `content/solutions-days.ts`) from its own world; `F` is that edition's
 * feature slugs. A trade with no written day shows no day.
 */

/** A "how it works" chip under a scene: a feature page, or another link. */
export type UsedLink<F extends string = string> =
    { feature: F } | { label: string; href: string; needs?: "templates" };

export interface DayHour<F extends string = string> {
    /** The world day's anchor: "9am", "tue7am". */
    anchor: string;
    mood: Words;
    title: Words;
    lead: Words;
    /**
     * The phone's lead, two lines at most (SOTradePhone2): the whole `lead`
     * folds under it, still in the HTML.
     */
    phoneLead?: Words;
    moments: readonly MomentData[];
    used: readonly UsedLink<F>[];
    /**
     * Moments that follow a claim: `on` while it is, else `off` (9 pm's
     * answer in Hinglish, or in English).
     */
    claimed?: {
        claim: ClaimSwitch;
        on: readonly MomentData[];
        off: readonly MomentData[];
    };
    /** A line under the moments, which may hold claims. */
    after?: Words;
    /** A dark note under the moments ("Have a developer…"). */
    note?: { text: string; link: { label: string; href: string } };
}

export interface TradeDay<F extends string = string> {
    /** The /for page it belongs to. */
    slug: string;
    business: WorldBusiness;
    /** Said after the page's own lead: "Follow Monday at …". */
    intro: string;
    /** The phone's one line under the h1, instead of the lead. */
    phoneIntro: string;
    /** "Follow Asha's day", to the first hour. */
    follow: string;
    /** The day it is: "Mon 16 Nov". */
    date: string;
    /** The trade bar's line: "Rye & Co., an example bakery". */
    example: string;
    /** That everything is made up, under the hero. */
    exampleNote?: string;
    stripTitle: string;
    /** Under the problems' heading: each one has an hour in the day. */
    problemsLine: string;
    /** The hero's picture: Home at the start of the day. */
    hero: HomeMoment;
    /** The first hour, drawn under the hero (its anchor, its line). */
    start: Omit<DayHour<F>, "title" | "lead"> & { line: string };
    hours: readonly DayHour<F>[];
    /** The next morning, told big after the night. */
    next?: {
        anchor: string;
        title: string;
        body: string;
        moment: WaitingMoment;
    };
    /** The closest written day, for a trade page without one. */
    doorLine: string;
}
