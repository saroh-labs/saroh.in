import type { YourPlanProps } from "@/components/settings/plan-billing/your-plan";
import type { BusinessBillingProfile } from "@/lib/billing-profiles/view";
import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";
import type {
    AddonRow,
    Cycle,
    PendingCheckout,
    PickerRow,
    PlanNote,
    SarohInvoice,
} from "@/lib/saroh-billing/plan-view";

/**
 * Settings › Plan and billing (DEC-259): only what the tab draws, worked
 * out on the server as the page did. Client-safe: the key and the route;
 * the service is `screen-service.ts`. Who Saroh bills crosses only to
 * whoever may change the plan, field by field; no provider secret is ever
 * read here (a waiting payment's window carries Razorpay's public key id).
 */
export type BillingScreen =
    /** No Saroh billing on this edition (Global): Free, and "Tell me when". */
    | { kind: "free" }
    /** The API refused the plan to this person. */
    | { kind: "denied" }
    | {
          kind: "plan";
          canChange: boolean;
          canOpenAskAi: boolean;
          plan: YourPlanProps;
          /** A catalogue plan: its card (null when the price list couldn't be read). */
          card: { row: PickerRow | null } | null;
          coming: { name: string; iso: string } | null;
          askAi: { used: number; limit: number | null } | null;
          /** Undefined: not this person's to see; null: couldn't be read. */
          billedTo?: BusinessBillingProfile | null;
          notes: PlanNote[];
          yearly: boolean;
          charges: number;
          addons: { rows: AddonRow[]; sum: string; canChange: boolean } | null;
          invoices: SarohInvoice[] | null;
          /** What couldn't be read, in words, or null. */
          partial: string | null;
      };

export const billingRead = defineRead<BillingScreen>()({
    key: (orgId) => domainKey("settings", orgId, "billing"),
    route: { path: "/api/settings/billing", params: {} },
    tier: "settings",
});

/**
 * Settings › Plan and billing › Change plan (DEC-259): every plan as its
 * card draws it, the cycle, and a payment still waiting (the owner's
 * alone). Nothing else of the price list or the subscription crosses.
 */
export type PlansScreen =
    /** The API refused the plan to this person. */
    | { kind: "denied" }
    | {
          kind: "plans";
          /** Per cycle; null when Saroh's price list couldn't be read. */
          rows: Record<Cycle, PickerRow[]> | null;
          yearly:
              { on: false } | { on: true; freeMonths: number; label: string };
          cycle: Cycle;
          currentPlan: string;
          /** A plan change waiting for its payment: only to whoever may change the plan. */
          pending: PendingCheckout | null;
      };

export const plansRead = defineRead<PlansScreen>()({
    key: (orgId) => domainKey("settings", orgId, "plans"),
    route: { path: "/api/settings/billing/plans", params: {} },
    tier: "settings",
});
