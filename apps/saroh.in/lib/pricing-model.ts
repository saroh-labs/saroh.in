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
}

export interface AddonView {
    id: string;
    name: string;
    line: string;
}

export type CompareRow =
    | { kind: "group"; label: string }
    | {
          kind: "line";
          label: string;
          soon: boolean;
          cells: ({ yes: true; t: string } | { yes: false })[];
      };

export interface PricingView {
    plans: PlanCardView[];
    addons: AddonView[];
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
