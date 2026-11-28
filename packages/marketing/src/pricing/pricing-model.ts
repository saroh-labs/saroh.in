import type { Catalog } from "@saroh/pricing-catalog";

/**
 * The pricing page's model: the shapes `pricing-view.ts` fills on the server
 * and the page's client part reads. Kept apart from the builder so the browser
 * bundle never carries the catalogue package.
 */

export type Cycle = "month" | "year";
export type ViewKey = `${Cycle}-${"excl" | "incl"}`;

export function viewKey(yearly: boolean, withTax: boolean): ViewKey {
    return `${yearly ? "year" : "month"}-${withTax ? "incl" : "excl"}`;
}

export interface PlanCardView {
    id: string;
    name: string;
    tagline: string;
    featured: boolean;
    /** The big figure, or the placeholder. */
    price: string;
    /**
     * The regular yearly price, struck through before `price`, when the
     * plan's yearly offer is shown (DEC-239); else absent.
     */
    was?: string;
    /** "a month", "a year, paid once"; empty beside the placeholder. */
    per: string;
    /** Free's line, or what the site says about tax and the yearly sum. */
    sub: string;
    /** "Launch offer" or "Yearly offer" beside the name, when one shows. */
    tag?: string;
    /**
     * After the offer: "then ‹regular› a month" under an offer price, or a
     * yearly offer's saving against paying monthly.
     */
    then?: string;
    /** Under a paid card's button: how paying works (the site's words). */
    note?: string;
    /** What the CTA builder needs (KTD-16). */
    cta: {
        plan: string;
        planName: string;
        paid: boolean;
        trialDays?: number;
        /** The cycle the card shows, carried to sign-up in open mode (U27). */
        cycle: Cycle;
    };
    /** "Everything in ‹previous›, plus:", or empty. */
    lead: string;
    /**
     * The plan's offer: its automatic discount ("₹X off a month for your
     * first N months", "N% off your first N months"), else "Try it free
     * for N days"; or empty.
     */
    trial: string;
    lines: { t: string; soon: boolean }[];
    /**
     * What the staff draft preview marks as changed from live, with "Show
     * what changed" on; never set on the public page.
     */
    changed?: { name: boolean; price: boolean; lines: string[] };
}

/**
 * A plan's automatic discount, from `GET /public/pricing`'s `offers`: off
 * each month's charge, before tax, for so many months.
 */
export interface PlanOffer {
    planId: string;
    /** Off each month before tax; a percent coupon's, worked out per plan. */
    discountPaise: number;
    months: number;
    /** A percent coupon's whole percent; absent: an amount off. */
    percentOff?: number;
    /** When the offer stops being given (ISO); absent: no end set. */
    endsAt?: string;
}

/** A usage cell for a plan that leaves the row out: drawn as a dash. */
export const NOT_INCLUDED = "Not included";

/** A row of "Usage beyond your plan": a group heading, or a catalogue row. */
export type UsageRow =
    | { kind: "group"; label: string }
    | {
          kind: "line";
          label: string;
          /** The row's one-line description, from the catalogue. */
          what: string;
          /** One per plan, in the plan cards' order. */
          cells: string[];
      };

export interface UsageView {
    rows: UsageRow[];
    /** The short notes under the table. */
    notes: string[];
}

export type CompareRow =
    | { kind: "group"; label: string }
    | {
          kind: "line";
          label: string;
          soon: boolean;
          /** The catalogue row's one-line description. */
          what?: string;
          cells: (({ yes: true; t: string } | { yes: false }) & {
              /** The draft preview's "was …", when this cell changed. */
              was?: string;
          })[];
          /** The draft preview: a row live doesn't have. */
          added?: boolean;
      };

export interface PricingView {
    plans: PlanCardView[];
    /** "Usage beyond your plan", or null when nothing can be added. */
    usage: UsageView | null;
    footnote: string;
    /** The note at the controls' end: the launch or yearly offer, or null. */
    notice: { title: string; body: string } | null;
}

export interface PricingPageModel {
    /** True when there is no catalogue to show: every price is the placeholder. */
    placeholder: boolean;
    /** The Monthly/Yearly switch, only when the catalogue offers yearly. */
    yearly: {
        freeMonths: number;
        /** The switch's yearly side ("Yearly · save up to X%" with an offer). */
        label: string;
    } | null;
    /** The site's own tax toggle, if it has one, and whether it starts ticked. */
    tax: { toggle: boolean; initial: boolean; on?: string };
    views: Record<ViewKey, PricingView>;
    rows: CompareRow[];
}

/** Which view a visitor is looking at; `usePricingSwitches` holds it. */
export interface PricingSwitches {
    yearly: boolean;
    setYearly: (v: boolean) => void;
    withTax: boolean;
    setWithTax: (v: boolean) => void;
    view: PricingView;
}

/**
 * What a site says about tax, when it adds any: how a sum is taxed and every
 * word around it. A site with no tax to mention has none, so no toggle.
 */
export interface PricingTax {
    add: (minor: number) => number;
    /** Under a monthly price. */
    subExcl: string;
    subIncl: string;
    /** After a sum in a sentence, with its leading space. */
    afterExcl: string;
    afterIncl: string;
    /** The sentence the cards' footnote ends with. */
    footnoteExcl: string;
    footnoteIncl: string;
    /** The tax switch's "with" side ("With N% GST"). */
    toggleOn?: string;
    /** The last note under the usage table. */
    noteExcl: string;
    noteIncl: string;
}

/** What a site brings to the builder: its currency, numbers and tax. */
export interface PricingSite {
    money: (minor: number) => string;
    count: (n: number) => string;
    tax: PricingTax | null;
    /** A date in the site's words and time zone ("20 Feb 2027"). */
    date?: (iso: string) => string;
    /** Under a paid card's button: how paying monthly or yearly works. */
    paidNote?: (catalog: Catalog, yearly: boolean) => string;
}

/** The page with no catalogue: the plans a site names, and its stand-in words. */
export interface PricingPlaceholder {
    plans: readonly { plan: string; name: string; featured: boolean }[];
    /** Where a figure would be. */
    price: string;
    /** Under it. */
    note: string;
    /** Where a plan's details would be. */
    details: string;
}
