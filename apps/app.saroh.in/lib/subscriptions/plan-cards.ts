import type { Plan } from "./service";
import { classesText, longPrice, money, olderPriceNotes } from "./view";

/**
 * How the Plans tab says a plan (D3, after "Saroh Subscriptions", Plans
 * tab). Pure, so the words are tested once and the card only draws them.
 */

export interface PlanCardView {
    id: string;
    name: string;
    description: string | null;
    /** "₹1,500 / month". */
    price: string;
    /** "8 classes a month included"; null where classes aren't sold. */
    classes: string | null;
    /** "12 subscribers · brings in ₹18,000 a month". */
    subscribers: string;
    /** "3 still on ₹1,200 — they keep it", one per older price. */
    olderPrices: string[];
    archived: boolean;
    draft: boolean;
    /** A live plan holding changes nobody has published yet (D5). */
    unpublished: boolean;
    /** A draft is never on sale, so it has nothing to archive. */
    canArchive: boolean;
}

function subscribersLine(
    plan: Pick<Plan, "subscriberCount" | "monthlyFromMembers" | "currency">,
): string {
    const n = plan.subscriberCount;
    if (!n) return "No subscribers yet";
    const people = `${n} ${n === 1 ? "subscriber" : "subscribers"}`;
    // Whole rupees: a card's figure is a sense of size, not a ledger line.
    const monthly = Math.round(Number(plan.monthlyFromMembers));
    return monthly > 0
        ? `${people} · brings in ${money(monthly, plan.currency)} a month`
        : `${people} · none paying right now`;
}

/**
 * One card's words. `withClasses` is whether the business sells classes
 * (Appointments on): a bakery's plan has no classes line at all.
 */
export function planCard(plan: Plan, withClasses: boolean): PlanCardView {
    const draft = plan.status === "DRAFT";
    return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: longPrice(plan.price, plan.currency, plan.interval),
        classes: withClasses
            ? plan.classesPerMonth
                ? `${classesText(plan.classesPerMonth)} included`
                : classesText(null)
            : null,
        subscribers: subscribersLine(plan),
        olderPrices: olderPriceNotes(plan),
        archived: plan.status === "ARCHIVED",
        draft,
        unpublished: !draft && Boolean(plan.pendingChangedAt),
        canArchive: !draft,
    };
}

/** The Plans tab's count: every plan not archived, drafts included. */
export function plansOnTab(plans: readonly Pick<Plan, "status">[]): number {
    return plans.filter((p) => p.status !== "ARCHIVED").length;
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
        ? `${plan.name} archived. Its ${n} ${n === 1 ? "subscriber carries" : "subscribers carry"} on; nobody new can join.`
        : `${plan.name} archived. Nobody new can join.`;
}

/**
 * Whether plan cards say classes: when Appointments is on. When the modules
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
