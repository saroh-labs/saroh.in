import { formatMoneyMajor } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { setPriceWords } from "@/lib/gst/on-price";
import type { Plan } from "./service";
import { classesText, olderPriceNotes, recurringPrice } from "./view";

/**
 * How the Plans tab says a plan (D3; rows of the shared list since the
 * Subscriptions audit of 12 Oct 2026, cards before). Pure, so the words
 * are tested once and the row only draws them. The file keeps its old
 * name: the Plan Editor's data reads `plansShowClasses` from it.
 */

export interface PlanRowView {
    id: string;
    name: string;
    /** "₹1,500 a month"; "₹1,500 a month + GST" where GST is added. */
    price: string;
    /** "8 classes a month", "Unlimited classes"; null where none are sold. */
    classes: string | null;
    /** People on it now, active or paused. */
    subscribers: number;
    /**
     * What its running members pay in a month, in whole rupees ("₹21,600");
     * null when nobody on it is paying now (everyone paused, or nobody).
     */
    monthly: string | null;
    /** "3 still on ₹1,200, and they keep it", one per older price. */
    olderPrices: string[];
    archived: boolean;
    draft: boolean;
    /** A live plan holding changes nobody has published yet (D5). */
    unpublished: boolean;
    /** A draft is never on sale, so it has nothing to archive. */
    canArchive: boolean;
}

/**
 * One row's words. `withClasses` is whether the business sells classes
 * (Appointments on): a bakery's plans have no classes column at all.
 */
export function planRow(plan: Plan, withClasses: boolean): PlanRowView {
    const draft = plan.status === "DRAFT";
    // Whole rupees: a row's figure is a sense of size, not a ledger line.
    const monthly = Math.round(Number(plan.monthlyFromMembers));
    return {
        id: plan.id,
        name: plan.name,
        // The business's own price list: the price it set, saying so where
        // GST comes on top ("₹2,000 a month + GST").
        price: setPriceWords(
            recurringPrice(plan.price, plan.currency, plan.interval),
            plan.gst,
        ),
        classes: withClasses ? classesText(plan.classesPerMonth) : null,
        subscribers: plan.subscriberCount,
        // Money coming in: what members pay, GST and all (the API's sum).
        monthly:
            plan.subscriberCount > 0 && monthly > 0
                ? formatMoneyMajor(monthly, plan.currency)
                : null,
        olderPrices: olderPriceNotes(plan),
        archived: plan.status === "ARCHIVED",
        draft,
        unpublished: !draft && Boolean(plan.pendingChangedAt),
        canArchive: !draft,
    };
}

/**
 * The Plans list's views, which its one dropdown switches between. Live is
 * the default: what is on sale now.
 */
export type PlanView = "live" | "archived" | "drafts" | "all";

export const PLAN_VIEWS: readonly PlanView[] = [
    "live",
    "archived",
    "drafts",
    "all",
];

export const PLAN_VIEW_LABEL: Record<PlanView, string> = {
    live: "Live",
    archived: "Archived",
    drafts: "Drafts",
    all: "All plans",
};

/** Whether a plan is in a view. */
export function inPlanView(
    plan: Pick<Plan, "status">,
    view: PlanView,
): boolean {
    switch (view) {
        case "live":
            return plan.status === "ACTIVE";
        case "archived":
            return plan.status === "ARCHIVED";
        case "drafts":
            return plan.status === "DRAFT";
        case "all":
            return true;
    }
}

/**
 * The Plans tab's count: the plans on sale now. Archived ones and drafts
 * are counted by their own views.
 */
export function livePlans(plans: readonly Pick<Plan, "status">[]): number {
    return plans.filter((p) => inPlanView(p, "live")).length;
}

/**
 * What the "no GST rate" notice adds on the Plans tab, when the plans it
 * counts are not all live ones: "5 of them are archived, with members
 * still on them." The notice counts plans on sale and archived plans
 * people are still on, and the tab counts live ones, so the two numbers
 * differ without it. Null when every plan it counts is live, when the
 * read lists only some of what is missing (the count would be a guess),
 * or when nothing is missing.
 */
export function missingRatesAlso(
    plans: readonly Pick<Plan, "id" | "status">[],
    missing: MissingRates | null,
): string | null {
    if (!missing?.registered || missing.more) return null;
    const archived = new Set(
        plans.filter((p) => p.status === "ARCHIVED").map((p) => p.id),
    );
    const noRate = missing.items.filter((i) => i.kind === "PLAN");
    const n = noRate.filter((i) => archived.has(i.id)).length;
    if (n === 0) return null;
    // "Of them" only when plans are all the notice counts.
    const of = noRate.length === missing.items.length ? "them" : "the plans";
    return `${count(n, `of ${of} is`, `of ${of} are`)} archived, with members still on ${plural(n, "it", "them")}.`;
}

/**
 * The toast after Archive or Sell again, which carries the Undo. Archiving
 * says who carries on, since that is what a merchant worries about.
 */
export function archiveToast(
    plan: Pick<Plan, "name" | "subscriberCount">,
    archived: boolean,
): string {
    if (!archived) return `${plan.name} is open to sign-ups again.`;
    const n = plan.subscriberCount;
    return n
        ? `${plan.name} archived. Its ${count(n, "subscriber carries", "subscribers carry")} on, and nobody new can join.`
        : `${plan.name} archived. Nobody new can join.`;
}

/**
 * Whether plan rows say classes: when Appointments is on. When the modules
 * couldn't be read, a plan that counts classes still says so rather than
 * hiding what it includes.
 */
export function plansShowClasses(
    appointments: boolean | null,
    plans: readonly Pick<Plan, "classesPerMonth">[],
): boolean {
    if (appointments !== null) return appointments;
    return plans.some((p) => p.classesPerMonth !== null);
}
