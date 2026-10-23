/**
 * The pricing page's model: the shapes `lib/pricing-view.ts` fills on the
 * server and the page's client part reads. Kept apart from the builder so
 * the browser bundle never carries the catalogue package.
 */

export type Cycle = "month" | "year";
export type ViewKey = `${Cycle}-${"excl" | "incl"}`;

export function viewKey(yearly: boolean, withGst: boolean): ViewKey {
    return `${yearly ? "year" : "month"}-${withGst ? "incl" : "excl"}`;
}

export interface PlanCardView {
    id: string;
    name: string;
    tagline: string;
    featured: boolean;
    /** The big figure, or the placeholder. */
    price: string;
    /** "a month", "a year"; empty beside the placeholder. */
    per: string;
    /** "Free for good", "+ GST", "Incl. GST", "About … a month + GST". */
    sub: string;
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
    /** "Try it free for N days", or empty. */
    trial: string;
    lines: { t: string; soon: boolean }[];
    /**
     * What the staff draft preview marks as changed from live, with "Show
     * what changed" on (`lib/pricing-marks.ts`); never set on the public page.
     */
    changed?: { name: boolean; price: boolean; lines: string[] };
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
}

export interface PricingPageModel {
    /** True when there is no catalogue to show: every price is the placeholder. */
    placeholder: boolean;
    /** The Monthly/Yearly switch, only when the catalogue offers yearly. */
    yearly: { freeMonths: number } | null;
    /** The "Show prices with GST" box, and whether it starts ticked. */
    gst: { toggle: boolean; initial: boolean };
    views: Record<ViewKey, PricingView>;
    rows: CompareRow[];
}
